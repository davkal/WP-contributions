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
			limit: 500,
			page: 1,
			status: function(total) {
				var pages = Math.ceil(total/(this.limit));
				return "{0}/{1}".format(this.page, pages);
			},
			sync: function(method, me, options) {
				var key = this.url();
				var cached = localStorage.getItem(key);
				if(cached) {
					options.success.call(this, JSON.parse(cached));
				} else {
					return Backbone.sync.call(this, method, this, options);
				}
			},
			retrieve: function() {
				var me = this;
				var key = this.url();
				me.fetch({
					add: !!me.append,
					success: function(col, res) {
						try { 
							localStorage.setItem(key, JSON.stringify(res));
						} 
						catch(e) {
							console.log("Quota exceeded. Throwing all away...");
							localStorage.clear();
						}
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
			calcSignatureDistance: function() {
				if(this.has('location')) {
					this.set({sig_dist: Authors.signatureDistance()});
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

		window.Revision = Model.extend({
			fetchAuthors: function() {
				var me = this;
				var url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(Article.get('pageid'), this.id);
				App.status("Authors for text in revision {0}...".format(this.id));
				$.get(url, function(res){
					App.status();
					var pattern = /{{#t:[^{}]*}}/gm;
					var tokens = res.responseText.match(pattern);
					var editors = _.uniq(_.map(tokens, function(token) {
						return token.replace("{{", "").replace("}}", "").split(",")[2];
					}));
					var sd;
				   	if(sd = Authors.signatureDistance(editors)) {
						me.set({sig_dist: sd});
					}
					me.set({authors: editors});
				});
			}
		});

		window.Author = Model.extend({});

		window.Authorship = Collection.extend({
			model: Author,
			signatureDistance: function(authors) {
				var sd = 0, loc, dist, count;
				var allCount = 0;
				this.each(function(author) {
					loc = author.get('location');
					// if "filter" is set, it must be an author property
					if(loc && (!authors|| _.include(authors, author.id))) {
						dist = loc.get('distance');
						count = author.get('count');
						allCount += count;
						sd += dist * count;
					}
				});
				return sd / allCount;
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
			model: Revision,
			append: true,
			continue: false,
			comparator: function(rev) {
				return rev.get('timestamp');
			},
			url: function() {
				var total = Article.get('count');
				App.status("Getting revisions {0}...".format(this.status(total)));
				var offset = this.continue || "";
				return "http://en.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&redirects&callback=?&rvlimit=500&pageids=" + Article.get('pageid') + offset;
			},
			parse: function(res) {
				var pages = res.query.pages;
				if(pages["-1"]) {
					App.error("Invalid article.");
					return;
				}
				App.status("Parsing revisions...");
				var loc;
				var page = _.first(_.values(pages));
				_.each(page.revisions, function(rev) {
					rev.id = rev.revid;
					delete rev.comment;
					if(loc = Locations.get(rev.user)) {
						rev.location = loc;
					}
				});
				App.status();
				if(res['query-continue']) {
					var next = res['query-continue'].revisions['rvstartid'];
					this.continue = "&rvstartid={0}".format(next);
					this.page++;
					_.defer(_.bind(this.retrieve, this));
				} else {
					this.continue = false;
				}
				return page.revisions;
			},
			fetchAuthors: function() {
				var rev = this.find(function(r) {
					return !r.has('authors') 
						&& Locations.get(r.get('user'));
				});
				if(rev) {
					rev.fetchAuthors();
				}
			},
			current: function() {
				var rev = this.get(Article.get("lastrevid"));
				CurrentRevision.set(rev.toJSON());
				return CurrentRevision;
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
					zoomControl: false,
					scrollwheel: false,
					draggable: false,
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
				if(_.size(Locations) && _.size(Authors)) {
					this.row(['span-two-thirds', 'span-one-third']);
					var located = Authors.filter(function(author) {
						return author.has('location');
					});
					var geoData = _.groupBy(located, function(author) {
						return author.get('location').get('region');
					});
					var geoCount = _.sortBy(_.map(geoData, function(authors, region) { 
						return [region, _.reduce(authors, function(memo, author) { return memo + author.get('count');}, 0)] 
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
			render: function() {
				if(CurrentRevision.has('authors')) {
					this.row(['span-two-thirds', 'span-one-third']);
					var authors = CurrentRevision.get('authors');
					locations = Locations.filter(function(loc) {
						return _.include(authors, loc.id);
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
					if(CurrentRevision.has('sig_dist')) {
						this.display("Signature distance", "{0} km".format(CurrentRevision.get('sig_dist').toFixed(3)));
					}
				}
				return this;
			}
		});

		window.TimeLineChartView = SectionView.extend({
			addModel: function(model) {
				var row;
			   	if(row = this.prepareRow(model)) {
					this.table.addRow(row);
					this.chart.draw(this.table);
					this.trigger('update');
				}
			},
			renderTable: function(rows) {
				this.table = new google.visualization.DataTable();
				this.table.addColumn('date', 'Date');
				this.table.addColumn('number', 'Sd(km)');
				if(rows) {
					this.table.addRows(rows);
				}
				this.chart = new google.visualization.LineChart(this.div(_.uniqueId("lineChart")));
				this.chart.draw(this.table, {width: 800});
			}
		});

		window.LocalnessView = TimeLineChartView.extend({
			title: "Localness",
			prepareRow: function(model) {
				if(model.has('sig_dist')) {
					return [new Date(model.get('timestamp')), model.get('sig_dist')];
				}
			},
			render: function() {
				if(_.size(Revisions)) {
					App.status("Calculating localness (ca. {0} sec.)...".format(_.size(Revisions) >> 8));
					this.row();
					var rows = [];
					var located = Revisions.filter(function(rev) {
						return rev.has('location');
					});
					var sd, slice;
					_.each(located, function(rev, index) {
						slice = _.map(located.slice(0, index+1), function(r) {
							return r.get('user');
						});
						sd = Authors.signatureDistance(slice);
						rows.push([new Date(rev.get('timestamp')), sd]);
					});
					this.renderTable(rows);
					App.status();
				}
				return this;
			}
		});


		window.AppView = Backbone.View.extend({
			el: $("body"),
			events: {
				"click #clear": "clear",
				"click #cache": "clearCache",
				"click #analyze": "analyzeOnClick",
				"keypress #input": "analyzeOnEnter"
			},
			initialize: function() {
				this.input = this.$("#input");
				this.statusEl = $('#status');
				this.cache = $('#cache');
				this.container = $('#content .container');
				this.nav = $('.topbar ul.nav');

				window.Article = new Page();
				window.CurrentRevision = new Revision();
				window.Authors = new Authorship();
				window.Revisions = new RevisionCollection();
				window.Locations = new LocationCollection;

				var av = new Overview();
				var lv = new LocationView();
				var mv = new MapView();
				var sv = new SurvivorView();
				var dv = new LocalnessView();

				Article.bind('change:input', Article.retrieve, Article);
				Article.bind('change:pageid', av.render, av);
				Article.bind('change:location', lv.render, lv);
				Article.bind('change:sig_dist', mv.render, mv);
				Article.bind('found', av.render, av);
				Article.bind('found', Authors.retrieve, Authors);

				Authors.bind('loaded', Revisions.retrieve, Revisions);
				Authors.bind('loaded', av.render, av);
				Authors.bind('loaded', mv.render, mv);
				Authors.bind('loaded', Article.calcSignatureDistance, Article);

				Revisions.bind('loaded', Revisions.current, Revisions);
				Revisions.bind('loaded', dv.render, dv);
				//Revisions.bind('change:authors', dv.addData, dv);
				//dv.bind('update', _.debounce(_.bind(Revisions.fetchAuthors, Revisions), 1500));

				CurrentRevision.bind('change:id', CurrentRevision.fetchAuthors, CurrentRevision);
				CurrentRevision.bind('change:authors', sv.render, sv);
			},
			status: function(msg) {
				var size = JSON.stringify(localStorage).length / 1024 / 1024;
				this.cache.text("Cache {0} MB".format(size.toFixed(2)));
				this.statusEl.text(msg || "Ready.");
			},
			clearCache: function() {
				localStorage.clear();
			},
			clear: function() {
				this.status();
				this.$('section div').remove();
				this.input
					.parents('.clearfix')
					.removeClass('error');
				$('a[href!="#"]', this.nav).remove();

				Article.clear({silent: true});
				CurrentRevision.clear({silent: true});
				Authors.reset(null, {silent: true});
				Bots.reset(null, {silent: true});
				Revisions.reset(null, {silent: true});
				Revisions.page = 1;
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
					this.analyze(text);
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
