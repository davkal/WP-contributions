define(["jquery", 
		"jquery.dateFormat", 
		"underscore", 
		"backbone", 
		"countries", 
		'goog!visualization,1,packages:[corechart,geochart]'
	], function($, dateFormat, _, Backbone, countries) {

		var countryList = _.pluck(countries.list, 'name');
		function countrify(country) {
			if(!country) {
				return "Unknown";
			}
			if(!_.include(countryList, country)) {
				_.each(countryList, function(listItem) {
					if(country.endsWith(listItem)) {
						country = listItem;
					}
				});
			}
			return country;
		}

		window.SectionView = Backbone.View.extend({
			initialize: function() {
				this.id = this.id || this.title.toLowerCase();
				this.el = $('#' + this.id);
			},
			div: function(id) {
				var el = this.make('div', {id: id});
				this.body.append(el);
				return el;
			},
			display: function(label, value) {
				this.form.append('<div class="clearfix"><label>' + label + '</label><div class="input"><p>' + value + '</p></div></div>');
			},
			textarea: function(label, value) {
				this.form.append('<div class="clearfix"><label>' + label + '</label><div class="input"><textarea class="xlarge" rows="6">' + value + '</textarea></div></div>');
			},
			header: function() {
				return '<div class="page-header"><h1>{0}</h1></div>'.format(this.title);
			},
			column: function(n) {
				this.body = this.$('.row div:nth-child({0})'.format(n));
				this.form = $('form', this.body);
			},
			row: function(spans) {
				spans = spans || ['span10'];
				var html = this.header();
				html += '<div class="row">';
				var formClass = spans.length > 1 ? "form-stacked" : "";
				_.each(spans, function(span) {
					html += '<div class="{0}"><form class="{1}"/></div>'.format(span, formClass);
				});
				html += '</div>';
				$(this.el).html(html);
				this.column(1);
				App.link(this);
				return this;
			}
		});

		window.Overview = SectionView.extend({
			title: "Overview",
			fetch: function() {
				var me = this;
				var url = "http://toolserver.org/~sonet/api.php?lang=en&editors&anons&callback=?&article="
					+ encodeURI(Article.get("title"));
				App.status("Querying toolserver...");
				$.getJSON(url, function(data){
					if(data.error) {
						me.trigger('error', "Invalid article.");
						return;
					} else {
						App.status();
					}
					var info = _.extract(data, ["first_edit", "count", "editor_count", "anon_count", "last_edit", "minor_count"]);
					Article.set(info);

					// adding all editors
					_.each(data.editors, function(obj, name) {
						Authors.add({
							id: name,
							count: obj.all,
							minor: obj.minor
						});
					});

					// adding anons
					var user, loc;
					_.each(data.anons, function(arr, ts) {
						if(arr && arr.length == 4) {
							user = arr[0];
							if(!Locations.get(user)) {
								Locations.add({
									id: user,
									region: countrify(arr[1]),
									latitude: arr[2],
									longitude: arr[3]
								});
							}
							loc = Locations.get(user);
							Revisions.add({
								id: ts,
								user: user,
								location: loc
							});
							Authors.get(user).set({location: loc});
						} else {
							console.log("Unknown location", arr);
						}
					});
					Authors.trigger('update');
					Locations.trigger('update');
				});
			},
			render: function() {
				this.row(['span-one-third', 'span-one-third', 'span-one-third']);
				var m = Article;
				var text, obj;
				this.display("Title", m.get('title'));
				this.display("Article ID", m.get('pageid'));
				if(m.has("first_edit")) {
					obj = m.get('first_edit');
					text = "{0} by {1}".format($.format.date(new Date(obj.timestamp * 1000), "yyyy-MM-dd hh:mm:ss"), obj.user);
					this.display("Created", text);
					this.display('Revision count', "{0} ({1} minor, {2} anonymous)"
							.format(m.get('count'), m.get('minor_count'), m.get('anon_count')));
					this.display('Contributors', "{0} users and unique IPs".format(m.get('editor_count')));
				}
				this.display("Last edited", m.get('touched'));

				if(_.size(Authors)) {
					this.column(2);
					var located = [];
					var editors = [];
					var bots = [];
					var name;
					Authors.each(function(author) {
						name = author.id;
						if(name.toLowerCase().endsWith('bot')) {
							bots.push(name);
						}
						if(author.get('location')) {
							located.push(name);
						}
						editors.push(name);
					});
					this.textarea('Contributors ({0})'.format(_.size(editors)), editors.join('\n'));
					this.textarea('Bots ({0})'.format(_.size(bots)), bots.join('\n'));
					this.column(3);
					this.textarea('Located ({0})'.format(_.size(located)), located.join('\n'));
				}

				return this;
			}
		});

		window.MapView = SectionView.extend({
			title: "Distribution",
			renderMap: function(rows) {
				var table = new google.visualization.DataTable();
				table.addColumn('string', 'Region');
				table.addColumn('number', 'Count');
				table.addRows(rows);
				var geoChart = new google.visualization.GeoChart(this.div(_.uniqueId("geoChart")));
				geoChart.draw(table);
			},
			render: function() {
				if(_.size(Locations) && _.size(Revisions)) {
					this.row(['span-two-thirds', 'span-one-third']);
					var geoData = Revisions.groupBy(function(rev) {
						return rev.get('location').get('region');
					});
					var geoCount = _.sortBy(_.map(geoData, function(num, key) { 
						return [key, _.size(num)] 
					}), function(num){return num[1]});
					geoCount.reverse();
					this.renderMap(geoCount);
					this.column(2);
					this.textarea('Countries ({0})'.format(_.size(geoCount)), geoCount.join('\n'));
				}
				return this;
			}
		});

		window.SurvivorView = MapView.extend({
			title: "Survivors",
			loaded: false,
			fetch: function() {
				var me = this;
				var url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(Article.get('pageid'), Article.get('lastrevid'));
				App.status("Querying WikiTrust...");
				$.get(url, function(res){
					App.status();
					var pattern = /{{#t:[^{}]*}}/gm;
					var tokens = res.responseText.match(pattern);
					var editors = _.uniq(_.map(tokens, function(token) {
						return token.replace("{{", "").replace("}}", "").split(",")[2];
					}));
					_.each(editors, function(editor) {
						var author = Authors.get(editor);
						author && author.set({survived: true});
					});
					me.loaded = true;
					me.render();
				});
			},
			render: function() {
				if(this.loaded && _.size(Locations) && _.size(Authors)) {
					this.row(['span-two-thirds', 'span-one-third']);
					locations = Locations.filter(function(loc) {
						return !!Authors.get(loc.id).get('survived');
					});
					var geoData = _.groupBy(locations, function(loc) {
						return loc.get('region');
					});
					var geoCount = _.sortBy(_.map(geoData, function(num, key) { 
						return [key, _.size(num)] 
					}), function(num){return num[1]});
					geoCount.reverse();
					this.renderMap(geoCount);
					this.column(2);
					this.textarea('Countries ({0})'.format(_.size(geoCount)), geoCount.join('\n'));
				}
				return this;
			}
		});
		window.AppView = Backbone.View.extend({
			el: $("body"),
			events: {
				"click #clear": "clear",
				//"click #analyze": "analyzeOnClick",
				"keypress #input": "analyzeOnEnter"
			},
			initialize: function() {
				this.input = this.$("#input");
				this.statusEl = $('#status');
				this.container = $('#content .container');
				this.nav = $('.topbar ul.nav');
			},
			status: function(msg) {
				this.statusEl.text(msg || "Ready.");
			},
			clear: function() {
				this.status();
				this.$('section div').remove();
				this.input
					.parents('.clearfix')
					.removeClass('error');
				this.nav.children('a[href!="#"]').remove();
			},
			link: function(sec) {
				if(!$('a[href="#{0}"]'.format(sec.id), this.nav).length) {
					this.nav.append('<li><a href="#' + sec.id +'">' + sec.title + '</a></li>');
					$('body').scrollSpy('refresh');
				}
			},
			error: function(text) {
				$('#input')
					.parents('.clearfix')
					.addClass('error');
				App.status(text);
			}, 
			analyze: function(input) {
				var me = this;
				var url = "http://en.wikipedia.org/w/api.php?action=query&prop=info&format=json&redirects&callback=?&titles="
					+ encodeURI(input);
				App.status("Querying en.wikipedia.org...");
				$.getJSON(url, function(data){
					var pages = data.query.pages;
					if(pages["-1"]) {
						me.error("Invalid article.");
						return;
					}
					App.status("Loaded article info.");

					window.Article = new Backbone.Model;
					window.Authors = new Backbone.Collection;
					window.Locations = new Backbone.Collection;
					window.Revisions = new Backbone.Collection;

					var page = _.first(_.values(pages));
					Article.set(page);

					var av = new Overview();
					av.render();
					Article.bind('change', av.render, av);
					Authors.bind('update', av.render, av);
					av.fetch();

					var mv = new MapView();
					Locations.bind('update', mv.render, mv);

					var sv = new SurvivorView();
					Locations.bind('update', sv.fetch, sv);
				});
			},
			analyzeOnClick: function(e) {
				var text = this.input.val();
				if(text) {
					analyze(text);
				}
				return false;
			},
			analyzeOnEnter: function(e) {
				var text = this.input.val();
				if (!text || (e.keyCode != 13)) return;
				this.analyze(text);
				return false;
			}
		});

	return {
		init: function() {
			window.App = new AppView;
		}
	}
});
