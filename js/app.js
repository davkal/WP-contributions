define(["jquery", 
		"jquery.dateFormat", 
		"underscore", 
		"backbone", 
		"countries", 
		'goog!visualization,1,packages:[corechart,geochart]'
	], function($, dateFormat, _, Backbone, countries) {

		window.Author = Backbone.Model.extend({
			defaults: {
				ip: false
			}

		});

		window.Article = Backbone.Model.extend({
			initialize: function(cfg) {
				this.input = cfg.input;
			}
		});

		window.Category = Backbone.Collection.extend({
			model: Article
		});

		window.SectionView = Backbone.View.extend({
			initialize: function() {
				this.id = this.id || this.title.toLowerCase();
				this.el = $('#' + this.id);
				this.render();
				this.model.bind('change', this.render, this);
				this.fetch();
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
					+ encodeURI(this.model.get("title"));
				App.status("Querying toolserver...");
				$.getJSON(url, function(data){
					if(data.error) {
						me.trigger('error', "Invalid article.");
						return;
					} else {
						App.status();
					}
					me.model.set(data);
				});
			},
			render: function() {
				this.row(['span-one-third', 'span-one-third']);
				var m = this.model;
				var text, obj;
				this.display("Title", m.get('title'));
				this.display("Article ID", m.get('pageid'));
				if(m.has("first_edit")) {
					obj = m.get('first_edit');
					text = "{0} by {1}".format($.format.date(new Date(obj.timestamp * 1000), "yyyy-MM-dd hh:mm:ss"), obj.user);
					this.display("Created", text);
					this.display('Revision count', "{0} ({1} minor)".format(m.get('count'), m.get('minor_count')));
					this.display('Contributors', "{0} ({1} anonymous)".format(m.get('editor_count'), m.get('anon_count')));
				}
				this.display("Last edited", m.get('touched'));

				if(m.has('editors')) {
					this.column(2);
					var editors = _.keys(m.get('editors'));
					var anons = _.pluck(_.values(m.get('anons')), 0);
					this.textarea('Editors ({0})'.format(_.size(editors)), editors.join('\n'));
					this.textarea('Anonmymous ({0})'.format(_.size(anons)), anons.join('\n'));
				}

				return this;
			}
		});

		window.MapView = SectionView.extend({
			title: "Distribution",
			el: $('#distribution'),
			initialize: function() {
				this.render();
				this.model.bind('change', this.render, this);
			},
			render: function() {
				this.row(['span-two-thirds', 'span-one-third']);
				var m = this.model;
				var text, obj;
				if(m.has('editors')) {
					console.log(this.model.attributes);
					var editors = _.keys(m.get('editors'));
					var anons = _.values(m.get('anons'));
					var countryList = _.pluck(countries.list, 'name');
					var table = new google.visualization.DataTable();
					table.addColumn('string', 'Region');
					table.addColumn('number', 'Count');
					var geoData = _.groupBy(anons, function(anon) { 
						if(!anon || !anon[1])
							return "Unknown";
						var country = anon[1];
						if(!_.include(countryList, country)) {
							_.each(countryList, function(listItem) {
								if(country.endsWith(listItem)) {
									country = listItem;
								}
							});
						}
						return country;
					});
					var geoCount = _.sortBy(_.map(geoData, function(num, key) { return [key, _.size(num)] }), function(num){return num[1]});
					geoCount.reverse();
					table.addRows(geoCount);
					var geoChart = new google.visualization.GeoChart(this.div("geoChart"));
					geoChart.draw(table);
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
			getDetails: function(article) {
				new MapView({model: article});
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
					window.article = new Article;
					var page = _.first(_.values(pages));
					article.set(page);
					var av = new Overview({model: article});
					me.getDetails(article);
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

		var analyze = function(input) {
				App.clear();
				var sec;
				App.status("Querying toolserver...");
				var url = "http://toolserver.org/~sonet/api.php?lang=en&article="
					+ encodeURI(input)
					+ "&editors&anons&callback=?";
				$.getJSON(url, function(data){
					if(data.error) {
						return;
					} else {
						App.status();
					}
					sec = App.addSection("Overview");
					sec.display('Created', "{0} by {1}".format($.format.date(new Date(data.first_edit.timestamp * 1000), "yyyy-MM-dd hh:mm:ss"), data.first_edit.user));
					sec.display('Revision count', "{0} ({1} minor)".format(data.count, data.minor_count));
					sec.display('Contributors', "{0} ({1} anonymous)".format(data.editor_count, data.anon_count));

					sec = App.addSection("Contributors");
					var editors = _.keys(data.editors);
					var anons = _.pluck(_.values(data.anons), 0);
					sec.textarea('All', editors.join('\n'));
					sec.textarea('Anonmymous users', anons.join('\n'));

					sec = App.addSection("Distribution");
					var countryList = _.pluck(countries.list, 'name');
					var table = new google.visualization.DataTable();
					table.addColumn('string', 'Region');
					table.addColumn('number', 'Count');
					var geoData = _.groupBy(_.values(data.anons), function(anon) { 
						if(!anon || !anon[1])
							return "Unknown";
						var country = anon[1];
						if(!_.include(countryList, country)) {
							_.each(countryList, function(listItem) {
								if(country.endsWith(listItem)) {
									country = listItem;
								}
							});
						}
						return country;
					});
					var geoCount = _.sortBy(_.map(geoData, function(num, key) { return [key, _.size(num)] }), function(num){return num[1]});
					geoCount.reverse();
					table.addRows(geoCount);
					var geoChart = new google.visualization.GeoChart(sec.div("geoChart"));
					geoChart.draw(table);
					sec.textarea('Anonymous grouped by country', geoCount.join('\n'));

					url = "http://en.wikipedia.org/w/api.php?action=query&prop=info&format=json&callback=?&titles="
						+ encodeURI(input)
					App.status("Querying en.wikipedia.org...")
					$.getJSON(url, function(data){
						App.status();
						var page = _.first(_.values(data.query.pages));
						var revid = page.lastrevid;
						var pageid = page.pageid;
						console.log(page);
						url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(pageid, revid);
						App.status("Querying WikiTrust...");
						$.get(url, function(res){
							App.status();
							var pattern = /{{#t:[^{}]*}}/gm;
							var tokens = res.responseText.match(pattern);
							var survivors = _.map(tokens, function(token) {
								return token.replace("{{", "").replace("}}", "").split(",")[2];
							});

							sec = App.addSection("Survivors");
							table = new google.visualization.DataTable();
							table.addColumn('string', 'Region');
							table.addColumn('number', 'Count');
							geoCount = _.sortBy(_.map(geoData, function(list, key) {
								var num = _.filter(list, function(item) {
									return _.include(survivors, item[0]);
								});
								return [key, _.size(num)];
						   	}), function(num){return num[1]});
							geoCount.reverse();
							table.addRows(geoCount);
							geoChart = new google.visualization.GeoChart(sec.div("geoChart2"));
							geoChart.draw(table);
							sec.textarea('Anonymous survivors grouped by country', geoCount.join('\n'));
						});
					});


				});
			// TODO get users
			//
			// TODO get ip locations
			//
			// TODO get coodinates of article
	};

	return {
		init: function() {
			window.App = new AppView;
		}
	}
});
