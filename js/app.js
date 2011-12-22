define(["jquery", 
		"jquery.dateFormat", 
		"underscore", 
		"backbone", 
		"countries", 
		'async!http://maps.google.com/maps/api/js?sensor=false',
		'goog!visualization,1,packages:[corechart,geochart]'
	], function($, dateFormat, _, Backbone, countries) {

		window.c = function() {
			console.log(arguments);
		};

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

		function signatureDistance(filter) {
			var sd = 0, loc, dist, count;
			var allCount = 0;
			Authors.each(function(author) {
				loc = author.get('location');
				// if "filter" is set, it must be an author property
				if(loc && (!filter || author.get(filter))) {
					dist = loc.get('distance');
					count = author.get('count');
					allCount += count;
					sd += dist * count;
				}
			});
			return sd / allCount;
		}

		window.Model = Backbone.Model.extend({
			retrieve: function() {
				var me = this;
				me.fetch({
					success: function(res) {
						me.trigger(me.loaded || 'loaded');
					}
				});
			}
		});

		window.Collection = Backbone.Collection.extend({
			continue: false,
			retrieve: function() {
				var me = this;
				me.fetch({
					add: !!me.append,
					success: function(res) {
						if(!me.continue) {
							me.trigger(me.loaded || 'loaded');
						}
					}
				});
			}
		});

		window.Location = Model.extend({
			calcDistance: function(loc) {
				this.set({distance: Location.geodesicDistance(this, loc)});
			}
		}, {
			patterns: {
				"{{coord\\|(\\d+)\\|(\\d+)\\|([\\d\\.]+)\\|([NS])\\|(\\d+)\\|(\\d+)\\|([\\d\\.]+)\\|([EW])\\|": function(match) {
					var ns = match[4] == 'S' ? -1 : 1;
					var ew = match[8] == 'W' ? -1 : 1;
					return [ns * (parseFloat(match[1]) + (parseFloat(match[2]) * 60 + parseFloat(match[3])) / 3600),
							ew * (parseFloat(match[5]) + (parseFloat(match[6]) * 60 + parseFloat(match[7])) / 3600) ]
				},
				"{{coord\\|(\\d+)\\|([\\d\\.]+)\\|([NS])\\|(\\d+)\\|([\\d\\.]+)\\|([EW])\\|": function(match) {
					var ns = match[3] == 'S' ? -1 : 1;
					var ew = match[6] == 'W' ? -1 : 1;
					return [(parseFloat(match[1]) + parseFloat(match[2]) / 60) * ns,
							(parseFloat(match[4]) + parseFloat(match[5]) / 60) * ew ]
				},
				"{{coord\\|([\\d\\.]+)\\|([NS])\\|([\\d\\.]+)\\|([EW])\\|": function(match) {
					var ns = match[2] == 'S' ? -1 : 1;
					var ew = match[4] == 'W' ? -1 : 1;
					return [parseFloat(match[1]) * ns,
							parseFloat(match[3]) * ew ]
				},
				"{{coord\\|(-?[\\d\\.]+)\\|(-?[\\d\\.]+)\\|display": function(match) {
					return [parseFloat(match[1]),
							parseFloat(match[2])]
				},
				"latd=(-?\\d+)\\s*\\|latm=(\\d+)\\s*\\|lats=([\\d\\.]+)\\s*\\|longd=(-?\\d+)\\s*\\|longm=(\\d+)\\s*\\|longs=([\\d\\.]+)": function(match) {
					return [parseFloat(match[1]) + (parseFloat(match[2]) * 60 + parseFloat(match[3])) / 3600,
							parseFloat(match[4]) + (parseFloat(match[5]) * 60 + parseFloat(match[6])) / 3600]
				},
				"latd=(\\d+)\\s*\\|latm=([\\d\\.]+)\\s*\\|latNS=([NS])\\s*\\|longd=(\\d+)\\s*\\|longm=([\\d\\.]+)\\s*\\|longEW=([EW])": function(match) {
					var ns = match[3] == 'S' ? -1 : 1;
					var ew = match[6] == 'W' ? -1 : 1;
					return [ (parseFloat(match[1]) + parseFloat(match[2]) / 60) * ns,
							(parseFloat(match[4]) + parseFloat(match[5]) / 60) * ew ]
				}
			},
			parseText: function(text) {
				var match, loc;
				_.any(Location.patterns, function(parser, pattern) {
					match = text.match(new RegExp(pattern, "im"));
					if(match && match.length > 1) {
						loc = parser(match);
					}
					return match;
				});
				if(loc) {
					return new Location({
						latitude: loc[0],
						longitude: loc[1]
					});
				} else {
					App.status("No match for geotag.");
				}
			},
			deg2rad: function(deg) {
				return parseFloat(deg) / 180 * Math.PI;
			},
			geodesicDistance: function(loc1, loc2) {
				var lat1 = Location.deg2rad(loc1.get('latitude'));
				var long1 = Location.deg2rad(loc1.get('longitude'));
				var lat2 = Location.deg2rad(loc2.get('latitude'));
				var long2 = Location.deg2rad(loc2.get('longitude'));
				var rad = Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(long1 - long2));
				return Math.abs(rad) * 6372.8;
			}
		});

		window.Page = Model.extend({
			loaded: 'found',
			url: function() {
				App.status("Querying en.wikipedia.org...");
				return "http://en.wikipedia.org/w/api.php?action=query&prop=info&format=json&redirects&callback=?&export&titles=" + encodeURI(this.get('input'));
			},
			calcSignatureDistanceSurvivors: function() {
				if(this.has('location')) {
					this.set({sig_dist_survivors: signatureDistance('survived')});
				}
			},
			calcSignatureDistance: function() {
				if(this.has('location')) {
					this.set({sig_dist: signatureDistance()});
				}
			},
			parse: function(res) {
				var pages = res.query.pages;
				if(pages["-1"]) {
					App.error("Invalid article.");
					return;
				}
				App.status("Loaded article info.");
				var page = _.first(_.values(pages));
				var xml = $.parseXML(res.query.export['*']);
				var text = $(xml).find('text').text();
				page['text'] = text;
				var loc;
				if(loc = Location.parseText(text)) {
					page['location'] = loc;
				}
				return page;
			}
		});

		window.Author = Model.extend({});

		window.Authorship = Collection.extend({
			model: Author,
			updateLocations: function() {
				if(_.size(Locations)) {
					var loc;
					this.each(function(author) {
						if(loc = Locations.get(author.id)) {
							author.set({location: loc});
						}
					});
					this.trigger('location');
				}
			},
			url: function() {
				if(Article.has('title')) {
					App.status("Querying toolserver...");
					return "http://toolserver.org/~sonet/api.php?lang=en&editors&anons&callback=?&article="
						+ encodeURI(Article.get('title'));
				}
			},
			parse: function(res) {
				if(res.error) {
					App.error("Invalid article.");
					return;
				} else {
					App.status("Parsing contributors...");
				}
				var info = _.extract(res, ["first_edit", "count", "editor_count", "anon_count", "last_edit", "minor_count"]);
				Article.set(info);

				// parsing locations
				var user, loc, dist;
				var articleLoc = Article.get('location');
				_.each(res.anons, function(arr, ts) {
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
						if(articleLoc && !loc.has('distance')) {
							loc.calcDistance(articleLoc);
						}
					} else {
						console.log("Unknown location", arr);
					}
				});

				// adding all editors
				var editors = [], author;
				_.each(res.editors, function(obj, name) {
					if(name.toLowerCase().endsWith('bot')) {
						Bots.add({
							id: name
						});
					}
					author = new Author({
						id: name,
						count: obj.all,
						minor: obj.minor
					});
					if(loc = Locations.get(name)) {
						author.set({location: loc});
					}
					Revisions.updateAuthor(author);
					editors.push(author)
				});

				App.status();
				return editors;
			}
		});

		window.Bots = new Collection;
		window.LocationCollection = Collection.extend({
			model: Location
		});
		window.RevisionCollection = Collection.extend({
			append: true,
			continue: false,
			url: function() {
				App.status("Getting revisions from en.wikipedia.org...");
				var offset = this.continue ? "&rvstart=" + this.continue : "";
				return "http://en.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&redirects&callback=?&rvlimit=500&pageids=" + Article.get('pageid') + offset;
			},
			parse: function(res) {
				var pages = res.query.pages;
				if(pages["-1"]) {
					App.error("Invalid article.");
					return;
				}
				App.status("Parsing revisions...");
				var page = _.first(_.values(pages));
				_.each(page.revisions, function(rev) {
					rev.id = rev.revid;
				});
				App.status();
				if(page.revisions.length == 500) {
					var last = page.revisions.pop();
					this.continue = last.timestamp;
					this.retrieve();
				} else {
					this.continue = false;
				}
				return page.revisions;
			},
			updateAuthor: function(author) {
				this.each(function(rev) {
					if(rev.get('user') == author.id) {
						rev.set({author: author});
					}
				});
			},
			updateLocation: function(ts, user, loc) {
				var rev = this.find(function(r) {
					return r.get('user') == user && r.get('timestamp') == ts;
				});
				if(rev) {
					rev.set({location: loc});
				} else {
					c("Could not update location for user " + user);
				}
			},
			merge: function() {
				var id = Article.get("lastrevid");
				var ts = Article.get("touched");
				var last = this.find(function(rev) {
					return rev.get("ts") == ts;
				});
				if(!last) {
					this.add({
						id: id
					});
					last = this.get(id);
				} else {
					last.set({ts: ts});
				}
				return
			}
		});

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
			textarea: function(label, value, rows) {
				rows = rows || 8;
				this.form.append('<div class="clearfix"><label>{0}</label><div class="input"><textarea class="xlarge" rows="{1}">{2}</textarea></div></div>'
					.format(label, rows, value));
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
					var name;
					Authors.each(function(author) {
						name = author.id;
						if(author.get('location')) {
							located.push(name);
						}
						editors.push(name);
					});
					this.textarea('Contributors ({0})'.format(_.size(editors)), editors.join('\n'));
					this.textarea('Content ({0})'.format(Article.get('length')), Article.get('text'));
					this.column(3);
					this.textarea('Located ({0})'.format(_.size(located)), located.join('\n'));
				}

				return this;
			}
		});

		window.LocationView = SectionView.extend({
			title: "Article Location",
			id: "location",
			renderMap: function(loc) {
				var myLatlng = new google.maps.LatLng(loc.get('latitude'), loc.get('longitude'));
				var myOptions = {
					zoom: 2,
					disableDefaultUI: true,
					mapTypeId: google.maps.MapTypeId.ROADMAP,
					center: myLatlng
				};
				var map = new google.maps.Map(this.div("map_canvas"), myOptions);
				var myMarker = new google.maps.Marker({
					map: map,
					position: myLatlng
				});
			},
			render: function() {
				var loc = Article.get('location');
				if(loc) {
					this.row(['span-two-thirds', 'span-one-third']);
					this.renderMap(loc);
					this.column(2);
					this.display('Latitude', loc.get('latitude').toFixed(3));
					this.display('Longitude', loc.get('longitude').toFixed(3));
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
					var located = Revisions.filter(function(rev) {
						return rev.has('author') && rev.get('author').has('location');
					});
					var geoData = _.groupBy(located, function(rev) {
						return rev.get('author').get('location').get('region');
					});
					var geoCount = _.sortBy(_.map(geoData, function(num, key) { 
						return [key, _.size(num)] 
					}), function(num){return num[1]});
					geoCount.reverse();
					this.renderMap(geoCount);
					this.column(2);
					this.textarea('Countries ({0})'.format(_.size(geoCount)), geoCount.join('\n'));
					if(Article.has('sig_dist')) {
						this.display("Signature distance", "{0} km".format(Article.get('sig_dist').toFixed(3)));
					}
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
					Article.calcSignatureDistanceSurvivors();

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
					if(Article.has('sig_dist_survivors')) {
						this.display("Signature distance", "{0} km".format(Article.get('sig_dist_survivors').toFixed(3)));
					}
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

				window.Article = new Page();
				window.Authors = new Authorship();
				window.Revisions = new RevisionCollection();
				window.Locations = new LocationCollection;

				var av = new Overview();
				var lv = new LocationView();
				var mv = new MapView();
				var sv = new SurvivorView();

				Article.bind('change:input', Article.retrieve, Article);
				Article.bind('change:pageid', av.render, av);
				Article.bind('change:location', lv.render, lv);
				Article.bind('change:sig_dist', mv.render, mv);
				Article.bind('found', av.render, av);
				Article.bind('found', Revisions.retrieve, Revisions);

				Revisions.bind('loaded', Authors.retrieve, Authors);

				Authors.bind('loaded', av.render, av);
				Authors.bind('loaded', Article.calcSignatureDistance, Article);
				Authors.bind('loaded', mv.render, mv);
				Authors.bind('loaded', sv.fetch, sv);
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
				$('a[href!="#"]', this.nav).remove();

				Article.clear({silent: true});
				Authors.reset(null, {silent: true});
				Bots.reset(null, {silent: true});
				Revisions.reset(null, {silent: true});
				Locations.reset(null, {silent: true});
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
				this.clear();
				Article.set({input: input});
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

//		var b = new Barticle({title: 'Egypt'});
//		b.bind('change', c);

	return {
		init: function() {
			window.App = new AppView;
		}
	}
});
