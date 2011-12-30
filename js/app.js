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

		window.CountryCollection = Backbone.Collection.extend({
			initialize: function() {
				var alt = {
					'Russia': 'Russian Federation'
				};
				this.each(function(c) {
					c.set({id: c.get('name')});
				});
			},
			isCountry: function(text) {
				return this.alt[text] || this.get(text);
			},
			countrify: function(country) {
				if(!country) {
					return "Unknown";
				}
				var c;
				if(!this.get(country)) {
					this.each(function(listItem) {
						if(country.endsWith(listItem.id)) {
							c = listItem.id;
						}
					});
				}
				if(c) {
					return c;
				} else {
					console.log("Could not countrify:", country);
					return country;
				}
			}
		});
		window.Countries = new CountryCollection(countries.list);

		window.Model = Backbone.Model.extend({
			checkDate: function(obj, attr) {
				var d = obj[attr];
				if(d) {
					obj[attr] = new Date(d);
				}
				return !d || !isNaN(obj[attr].getTime());
			},
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
			continue: true,
			append: true,
			limit: 500,
			page: 1,
			offset: null,
			initialize: function(models, options) {
				_.extend(this, options || {});
			},
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
						if(!me.offset) {
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
				"(-?[\\d\\.]+);\\s*(-?[\\d\\.]+)": function(match) {
					return [parseFloat(match[1]),
							parseFloat(match[2])]
				},
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
			fromArticle: function(title, target, eventName) {
				var article = new Page({title: title, lang: Article.get('lang')});
				article.bind('additional', function() {
					var loc = new Location(article.get('location').toJSON());
					if(loc) {
						target.set({location: loc});
					}
					if(eventName) {
						target.trigger(eventName);
					}
				});
				article.fetchAdditionalData();
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
			defaults: {
				'lang': 'en',
				'full_text': false
			},
			loaded: 'found',
			isMain: function() {
				return this == Article;
			},
			validate: function(attrs) {
				if(!this.checkDate(attrs, 'start') || !this.checkDate(attrs, 'end')) {
					return 'wrong date format';
				}
			},
			url: function() {
				App.status("Querying en.wikipedia.org...");
				var url = "http://{0}.wikipedia.org/w/api.php?action=query&prop=info&format=json&redirects&callback=?&titles={1}".format(this.get('lang'), encodeURI(this.get('input')));
				if(this.get('full_text')) {
					url += "&export";
				}
				return url;
			},
			calcSignatureDistance: function() {
				if(this.has('location')) {
					this.set({sig_dist: Authors.signatureDistance()});
				}
			},
			phase: function() {
				if(this.has('start')) {
					if(this.has('end')) {
						return 2; // ended
					}
					return 1; // ongoing
				} 
				return 0; // w/o interval
			},
			checkDates: function() {
				// check parsed templates of dates have not been found yet
				if(!this.has('start') && this.has('templates')) {
					var infobox = this.get('templates').findByType('infobox');
					if(infobox) {
						var period = infobox.period();
						if(period && period.length == 2) {
							this.set({start: period[0]});
							this.set({end: period[1]});
						}
					}
				}
			},
			fetchAdditionalData: function() {
				var me = this;
				var url = "http://{0}.wikipedia.org/w/api.php?action=parse&format=json&callback=?&".format(this.get('lang'));
				url += this.has('pageid') ? "pageid=" + this.get('pageid') : "redirects&page=" + encodeURI(this.get('title'));
				if(!this.isMain()) {
					url += "&prop=text";
				}
				App.status("Getting HTML for  {0}...".format(this.get('title') || this.get('pageid')));
				$.getJSON(url, function(res){
					App.status("Extracting page features...");
					// INSIGHT better to parse the HTML than wikitext
					var attr = {};
					attr.text = "<text>{0}</text>".format(res.parse.text['*']);
					var $text = $(attr.text);
					var infobox = $text.find('.infobox').first();

					// article location
					var location = $('.geo-nondefault .geo', infobox).first();
					if(location = Location.parseText(location.text())) {
						attr.location = location;
					}

					if(me.isMain()) {
						// dont give up on article location
						var country = $('.flagicon a', infobox);
						if(country = country.attr('title')) {
							attr.country = country;
						} else {
							var links = $text.find('p').first().children('a');
							_.each(links, function(l) {
								if(!country) {
									var c = Countries.get(l.title);
									if(c) {
										country = c.id;
									}
								}
							});
						}

						// event interval
						var start = $('.dtstart', infobox);
						if(start = start.text()) {
							attr.start = start;
						}

						var end = $('.dtend', infobox);
						if(end = end.text()) {
							attr.end = end;
						}

						// articles in other lang editions
						attr.languages = new LanguageCollection([{
							title: me.get('title'),
							lang: me.get('lang')
						}]);
						// BEWARE: this isnt a full clique
						_.each(res.parse.langlinks, function(ll) {
							attr.languages.add({title: ll['*'], lang: ll.lang});
						});
						me.checkDates();
					}
					App.status();
					me.set(attr);
					if(country && !location && me.isMain()) {
						// trying to get location from country in infobox
						Location.fromArticle(country, me, 'additional');
					} else {
						me.trigger('additional');
					}
				});
			},
			parse: function(res) {
				var pages = res.query.pages;
				if(pages["-1"]) {
					App.error("Invalid article.");
					return;
				}
				App.status("Loaded article info.");
				var page = _.first(_.values(pages));
				if(res.query.export) {
					var xml = $.parseXML(res.query.export['*']);
					var text = $(xml).find('text').text();
					page.wikitext = text;
					page.templates = Templates.fromText(text);
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
					App.status("Parsing wikitext...");
					var pattern = /{{#t:[^{}]*}}/gm;
					var tokens = res.responseText.match(pattern);
					var editors = _.uniq(_.map(tokens, function(token) {
						return token.replace("{{", "").replace("}}", "").split(",")[2];
					}));
					var sd;
				   	if(sd = Authors.signatureDistance(editors)) {
						me.set({sig_dist: sd});
					}
					App.status();
					me.set({authors: editors});
				});
			}
		});

		window.Author = Model.extend({});

		window.Template = Model.extend({
			period: function() {
				var m;
			   	if(m = this.match(/\|\s*date\s*=\s*([^-–|]*)\s*[-–]\s*([^-–|]*)\s*\|/)) {
					return m
				}
			},
			match: function(reg) {
				var m = this.get('content').match(reg); 
				return m && _.map(m.slice(1), function(s) {
					return s.trim();
				});
			}
		});

		window.Templates = Collection.extend({
			model: Template,
			findByType: function(type) {
				return this.find(function(t) {
					return t.has('type') && t.get('type').toLowerCase().startsWith(type);
				});
			}
		}, {
			fromText: function(text) {
				var altRe = /{{[^]*?({{[^{}]*?}}[^]*?)*}}/g;
				// abusing jquery html tree selectors
				var t = "<text>{0}</text>".format(text
					.replace(/{{/g, "<template>")
					.replace(/}}/g, "</template>"));
				var templates = $(t).find('template');
				templates = _.map(templates, function(temp) {
					var content = $(temp).text();
					var stop = content.indexOf("|");
					var obj = {
						content: content
					};
					if(stop > 0) {
						obj.type = content.slice(0, stop);
					}
					return obj;
				});
				return new Templates(templates);
			}
		});

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
								region: Countries.countrify(arr[1]),
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
			offset: null,
			comparator: function(rev) {
				return rev.get('timestamp');
			},
			url: function() {
				var article = this.article || Article;
				if(article.has('count')) {
					var total = article.get('count');
					App.status("Getting revisions {0}...".format(this.status(total)));
				} else {
					App.status("Getting revisions for language {0}...".format(article.get('lang')));
				}
				var offset = this.offset || "";
				var identifier = article.has('pageid') ? "pageids=" + article.get('pageid') : "titles=" + encodeURI(article.get('title'));
				var url = "http://{0}.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&redirects&callback=?&rvdir=newer&rvlimit={1}&{2}{3}".format(article.get('lang'), this.limit, identifier, offset);
				return url;
			},
			parse: function(res) {
				var pages = res.query.pages;
				if(pages["-1"]) {
					App.error("Invalid article.");
					return;
				}
				var loc;
				var page = _.first(_.values(pages));
				_.each(page.revisions, function(rev) {
					rev.id = rev.revid;
					delete rev.comment;
					if(loc = Locations.get(rev.user)) {
						rev.location = loc;
					}
				});
				if(this.continue && res['query-continue']) {
					var next = res['query-continue'].revisions['rvstartid'];
					this.offset = "&rvstartid={0}".format(next);
					this.page++;
					_.defer(_.bind(this.retrieve, this));
				} else {
					this.offset = null;
				}
				App.status();
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
			current: function(id) {
				var rev = id && this.get(parseInt(id)) || this.last();
				CurrentRevision.set(rev.toJSON());
				return CurrentRevision;
			}
		});

		window.LanguageCollection = Collection.extend({
			model: Page,
			fetchNext: function() {
				var article = this.find(function(a) {
					return !a.has('revisions');
				});
				if(article) {
					var revisions = new RevisionCollection([], {
						article: article, 
						continue: false,
						limit: 10
					});
					revisions.bind('loaded', function() {
						article.set({revisions: revisions});
					});
					revisions.retrieve();
				}
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
			link: function(label, value, href) {
				this.display(label, '<a href="{0}" target="_blank">{1}</a>'.format(href, value));
			},
			textarea: function(label, value, rows) {
				rows = rows || 7;
				this.form.append('<div class="clearfix"><label>{0}</label><div class="input"><textarea class="xlarge" rows="{1}">{2}</textarea></div></div>'
					.format(label, rows, value));
				return $('textarea', this.form).last();
			},
			header: function() {
				return '<div class="page-header"><h1>{0} <small>{1}</small></h1></div>'.format(this.title, this.subtitle || "");
			},
			column: function(n) {
				this.body = this.$('.row div:nth-child({0})'.format(n));
				this.form = $('form', this.body);
			},
			subview: function(cls, model) {
				return new cls({el: $(this.form), model: model});
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

		window.FieldView = SectionView.extend({
			initialize: function() {
				this.form = this.el;
				if(this.model) {
					this.model.bind('change', this.render, this);
					this.render();
				} else {
					this.fetch();
				}
			}
		});

		window.LanguageView = FieldView.extend({
			render: function() {
				if(this.model) {
					if(!this.field) {
						this.field = this.textarea("Languages ({0})".format(_.size(this.model)), "");
					}
					var loaded = this.model.filter(function(a) {
						return a.has('revisions');
					});
					loaded = _.sortBy(loaded, function(a) {
						return a.get('revisions').first().get('timestamp');
					});
					var list = _.map(loaded, function(a) {
						return "{0}: {1}".format(a.get('lang'), a.get('revisions').first().get('timestamp'));
					});
					this.field.val(list.join("\n"));
					this.model.fetchNext();
				}
			}
		});

		window.Overview = SectionView.extend({
			title: "Overview",
			render: function() {
				this.row(['span-one-third', 'span-one-third', 'span-one-third']);
				var m = Article;
				var text, obj;
				this.link("Title", "{0} ({1})".format(m.get('title'), m.get('lang')), "http://{0}.wikipedia.org/wiki/{1}".format(m.get('lang'), m.get('title')));
				this.display("Article ID", m.get('pageid'));
				if(m.has("first_edit")) {
					obj = m.get('first_edit');
					text = "{0} by {1}".format($.format.date(new Date(obj.timestamp * 1000), "yyyy-MM-dd hh:mm:ss"), obj.user);
					// FIXME timestamp is not UTC
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
					this.textarea('Content ({0})'.format(Article.get('length')), _.escape(Article.get('wikitext')));
					this.column(3);
					this.textarea('Located ({0})'.format(_.size(located)), located.join('\n'));
					var lv = this.subview(LanguageView, Article.get('languages'));
				}

				return this;
			}
		});

		window.PropertiesView = SectionView.extend({
			id: "properties",
			title: "Article properties",
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
				var start = Article.get('start');
				var end = Article.get('end');
				if(start || loc && loc.has('latitude')) {
					this.row(['span-two-thirds', 'span-one-third']);
					if(loc && loc.has('latitude')) {
						this.renderMap(loc);
						this.column(2);
						this.display('Location', "{0}; {1}".format(loc.get('latitude').toFixed(3), loc.get('longitude').toFixed(3)));
					}
					if(start) {
						this.display('Start', $.format.date(start, "yyyy-MM-dd"));
						this.display('End/Status', end ? $.format.date(end, "yyyy-MM-dd") : 'ongoing');
					}
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
					var m = CurrentRevision;
					this.subtitle = "revision: {0} time: {1} user: {2}".format(m.id, m.get('timestamp'), m.get('user'));
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
			onSelect: function() {
			},
			renderTable: function(rows) {
				var me = this;
				this.table = new google.visualization.DataTable();
				this.table.addColumn('date', 'Date');
				this.table.addColumn('number', 'Sd(km)');
				this.table.addColumn({type: 'string', role: 'annotationText'});
				if(rows) {
					this.table.addRows(rows);
				}
				this.chart = new google.visualization.LineChart(this.div(_.uniqueId("lineChart")));
				google.visualization.events.addListener(this.chart, 'select', function(){
					var sel = me.chart.getSelection()[0];
					var revid = me.table.getValue(sel.row, 2);
					Revisions.current(revid);
				});
				this.chart.draw(this.table, {width: 800});
			}
		});

		window.LocalnessView = TimeLineChartView.extend({
			title: "Localness",
			prepareRow: function(model) {
			},
			render: function() {
				if(_.size(Revisions) && Article.has('location')) {
					App.status("Calculating localness (ca. {0} sec.)...".format(_.size(Revisions) >> 8));
					this.row();
					var rows = [];
					var located = Revisions.filter(function(rev) {
						return rev.has('location');
					});
					var sd, dist;
					// incremental signature distance
					var localness = _.memoize(function(i, list) {
						dist = list[i].get('location').get('distance');
						if(i == 0) {
							return dist;
						}
						return (dist + (i- 1) * localness(i - 1, list)) / i;
					});
					_.each(located, function(rev, index) {
						sd = localness(index, located);
						rows.push([new Date(rev.get('timestamp')), sd, "" + rev.id]);
					});
					this.renderTable(rows);
					App.status();
				}
				return this;
			}
		});

		// TODO exclude bots
		// TODO compare localness of other languages
		// TODO userpages/talk-userpages
		// TODO getting userpages annotated
		// TODO you are where you edit

		window.AppView = Backbone.View.extend({
			el: $("body"),
			events: {
				"click #clear": "clear",
				"click #cache": "clearCache",
				"click #analyze": "analyzeOnClick",
				"click .example": "analyzeExample",
				"keypress #input": "analyzeOnEnter"
			},
			initialize: function() {
				this.input = this.$("#input");
				this.statusEl = $('#status');
				this.cache = $('#cache');
				this.container = $('#content .container');
				this.nav = $('.topbar ul.nav');

				window.Article = new Page({full_text: true});
				window.CurrentRevision = new Revision();
				window.Authors = new Authorship();
				window.Revisions = new RevisionCollection();
				window.Locations = new LocationCollection;

				var av = new Overview();
				var pv = new PropertiesView();
				var mv = new MapView();
				var sv = new SurvivorView();
				var dv = new LocalnessView();

				Article.bind('change:input', Article.retrieve, Article);
				Article.bind('change:pageid', Article.fetchAdditionalData, Article);
				Article.bind('change:pageid', av.render, av);
				Article.bind('change:location', pv.render, pv);
				Article.bind('change:location', dv.render, dv);
				Article.bind('change:sig_dist', mv.render, mv);
				Article.bind('found', av.render, av);
				Article.bind('additional', Authors.retrieve, Authors);

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
			status: _.debounce(function(msg) {
				var size = JSON.stringify(localStorage).length / 1024 / 1024;
				this.cache.text("Cache {0} MB".format(size.toFixed(2)));
				this.statusEl.text(msg || "Ready.");
			}, 500),
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

				Article.unbind();
				CurrentRevision.unbind();
				Authors.unbind();
				Bots.unbind();
				Revisions.unbind();
				Locations.unbind();

				this.initialize();
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
				if(Article.has('input')) {
					this.clear();
				}
				Article.set({input: input});
			},
			analyzeExample: function(e) {
				this.input.val($(e.target).attr("title"));
				return this.analyzeOnClick();
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
