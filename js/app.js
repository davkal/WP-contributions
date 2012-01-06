define(["jquery", 
		"jquery.dateFormat", 
		"underscore", 
		"backbone", 
		"lz77", 
		"wpdateparser", 
		"wpcoordinatesparser", 
		"countries", 
		"bots", 
		'async!http://maps.google.com/maps/api/js?sensor=false',
		'goog!visualization,1,packages:[corechart,geochart]'
	], function($, dateFormat, _, Backbone, lz77, DateParser, CoordsParser, countries, botlist) {

		window.c = function() {
			console.log(arguments);
		};

		window.CACHE_LIMIT = 50000; // keep low, big pages are worth the transfer

		window.Model = Backbone.Model.extend({
			checkDate: function(obj, attr) {
				var d = obj[attr];
				if(d && !_.isDate(d)) {
					obj[attr] = new Date(d);
				}
				return !d || !isNaN(obj[attr].getTime());
			},
			sync: function(method, me, options) {
				var key = this.url();
				var cached = App.getItem(key);
				if(cached) {
					options.success.call(this, cached);
				} else {
					return Backbone.sync.call(this, method, this, options);
				}
			},
			retrieve: function() {
				var me = this;
				var key = this.url();
				me.fetch({
					success: function(model, res) {
						App.setItem(key, res);
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
				var cached = App.getItem(key);
				if(cached) {
					options.success.call(this, cached);
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
						App.setItem(key, res);
						if(!me.offset) {
							me.trigger(me.loaded || 'loaded');
						}
					}
				});
			}
		});

		window.Location = Model.extend({
			toString: function() {
				var str = "{0}; {1}".format(this.get('latitude'), this.get('longitude'));
				if(this.has('region')) {
					str += " ({0})".format(this.get('region'));
				}
				return str;
			},
			calcDistance: function(loc) {
				this.set({distance: Location.geodesicDistance(this, loc)});
			}
		}, {
			fromArticle: function(title, target, signal) {
				var article = new Page({title: title, lang: Article.get('lang')});
				article.bind('additional', function() {
					var loc = article.get('location');
					if(loc) {
						loc = loc.clone();
						if(Countries.isCountry(title)) {
							loc.set({region: title});
						}
						target.set({location: loc});
					}
					if(signal) {
						target.trigger(signal);
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
				'ongoing': false,
				'full_text': false
			},
			loaded: 'found',
			isMain: function() {
				return this == window.Article;
			},
			url: function() {
				App.status("Querying en.wikipedia.org...");
				var input = this.get('input');
				var identifier = isNaN(input) ? "titles={0}".format(encodeURI(input)) : "pageids={0}".format(input);
				var full = this.get('full_text') ? "&export" : "";
				var url = "http://{0}.wikipedia.org/w/api.php?action=query&prop=info&format=json&redirects&callback=?&{1}{2}".format(this.get('lang'), identifier, full);
				return url;
			},
			calcSignatureDistance: function() {
				if(this.has('location')) {
					this.set({sig_dist: this.get('authors').signatureDistance()});
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
			toString: function() {
				var str = [this.get('title')];
				var start = this.get('start');
				str.push(start ? $.format.date(start, "yyyy-MM-dd") : "No start");
				if(this.has('ongoing')) {
					str.push('ongoing');
				} else {
					var end = this.get('end');
					str.push(end ? $.format.date(end, "yyyy-MM-dd") : "No end");
				}
				var location = this.get('location');
				str.push(location ? location.toString() : "Unknown");
				return str.join(' ');
			},
			parseDates: function($infobox) {
				var dates;
				// event interval with hcard annotations
				var start = $('.dtstart', $infobox);
				if(start = start.text()) {
					start = new Date(start);
					var end = $('.dtend', $infobox).text();
					end = end ? new Date(end) : new Date();
					dates = [start, end];
				}
				// check parsed templates of dates have not been found yet
				if(!dates && this.has('templates')) {
					var infobox = this.get('templates').findByType('infobox');
					if(infobox) {
						dates = infobox.period();
					}
				}
				if(!dates) {
					dates = DateParser.parse(this.get('sentence'));
				}
				if(!dates) {
					dates = DateParser.parse(this.get('paragraph'));
				}
				if(dates) {
					this.set({start: dates[0]});
					this.set({end: dates[1]});
					if(new Date() - this.get('end') < 10*1000) {
						this.set({ongoing: true});
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
					var text = res.parse.text['*'].replace(/<img[^>]+>/ig, "<img>");
					var $text = $(text);
					var paragraph = $text.next('p').text();
					var sentence = paragraph.split('.')[0];
					me.set({
						text: text,
						sentence: sentence, // 1st
						paragraph: paragraph // 1st
					});

					var attr = {};
					var $infobox = $text.next('.infobox').first();

					// article location
					var location = $text.find('#coordinates .geo').first();
					if(!location.length) {
						// coords maybe inside infobox
						location = $('.geo', $infobox).first();
					}

					if(location = CoordsParser.parse(location.text())) {
						attr.location = new Location(location);
					}

					if(me.isMain()) {
						// dont give up on article location
						var flag = $('.location', $infobox);
						var country = $('a', flag);
						// TODO location candidates , e.g. Maspero demonstrations
						if(!country.length) {
							country = flag.next('a');
						}
						// check for flag
						if(country = country.attr('title')) {
							attr.country = Countries.isCountry(country);
						} else {
							// check first paragraph for country names
							var links = $text.next('p').first().children('a');
							_.each(links, function(l) {
								if(!country) {
									var c = Countries.isCountry(l.title);
									if(c) {
										country = c.id;
									}
								}
							});
						}

						me.parseDates($infobox);

						// articles in other lang editions
						var languages = [{
							title: me.get('title'),
							lang: me.get('lang')
						}];
						// BEWARE: this isnt a full clique
						_.each(res.parse.langlinks, function(ll) {
							languages.push({title: ll['*'], lang: ll.lang});
						});
						me.get('languages').reset(languages);
					}
					App.status();
					me.set(attr);
					// short circuit here with false
					var signal = me.has('start') || !me.isMain() ? 'additional' : 'done';
					if(country && !location && me.isMain()) {
						// trying to get location from country in infobox
						// TODO dont just try country, see Ulster_Workers%27_Council_strike
						Location.fromArticle(country, me, signal);
					} else {
						me.trigger(signal);
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

		window.MainArticle = Page.extend({
			defaults: {
				lang: 'en',
				full_text: true
			},
			initialize: function() {
				var authors = new Authorship;
				var revisions = new RevisionCollection;
				var locations = new LocationCollection;
				var languages = new LanguageCollection;
				var current = new Revision;
				var bots = new Authorship(_.map(botlist.list, function(b){return {id: b};}));

				this.bind('change:input', this.retrieve, this); 
				this.bind('change:pageid', this.fetchAdditionalData, this); 
				this.bind('additional', authors.retrieve, authors);

				authors.bind('loaded', revisions.retrieve, revisions);
				authors.bind('loaded', this.calcSignatureDistance, this);
				authors.bind('loaded', authors.checkUserPages, authors);

				revisions.bind('loaded', revisions.current, revisions);

				current.bind('change:id', current.fetchAuthors, current);

				languages.bind('reset', languages.fetchNext, languages);
				languages.bind('change', languages.fetchNext, languages);

				languages.bind('done', function(){this.done('languages')}, this);
				authors.bind('done', function(){this.done('authors')}, this);

				this.set({
					authors: authors,
					revisions: revisions,
					locations: locations,
					languages: languages,
					current: current,
					bots: bots
				});
			},
			todo: ['languages', 'authors'],
			done: function(todoItem) {
				this.todo = _.without(this.todo, todoItem);
				if(!_.size(this.todo)) {
					this.trigger('done');
				}
			},
			h1: function() {
				// TODO disregard when end? was before article was created
				var start = this.get('start');
				if(start) {
					var created = this.get('revisions').at(0).get('timestamp');
					var diff = new Date(created) - new Date(start);
					var days = diff / 1000 / 60 / 60 / 24;
					return "{0} ({1})".format(days < 3 ? 'True' : 'False', days.toFixed(1));
				}
				return "Unknown (no start date).";
			}
		});

		// TODO try templates
		// Infobox_military_conflict
		// Infobox_civil_conflict
		// Infobox_historical_event

		window.TemplateEmbedders = Collection.extend({
			model: Page,
			offset: null,
			fetchPages: function(title) {
				this.title = title;
				this.retrieve();
			},
			url: function() {
				var offset = this.offset || "";
				var url = "http://{0}.wikipedia.org/w/api.php?action=query&list=embeddedin&format=json&eititle=Template%3A{1}&einamespace=0&eilimit=500&redirects&callback=?{2}".format('en', this.title, offset);
				return url;
			},
			parse: function(res) {
				var pages = res.query.embeddedin;
				if(!pages.length) {
					App.error("Invalid template.");
					return;
				}
				_.each(pages, function(p) {
					p.id = p.pageid;;
				});
				if(this.continue && res['query-continue']) {
					var next = res['query-continue'].embeddedin['eicontinue'];
					this.offset = "&eicontinue={0}".format(next);
					this.page++;
					_.defer(_.bind(this.retrieve, this));
				} else {
					this.offset = null;
				}
				App.status();
				return pages;
			}
		});

		window.Revision = Model.extend({
			fetchAuthors: function() {
				var me = this;
				var url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(Article.get('pageid'), this.id);
				App.status("Authors for text in revision {0}...".format(this.id));
				$.get(url, function(res){
					App.status("Parsing wikitext...");
					var authors = Article.get('authors');
					var pattern = /{{#t:[^{}]*}}/gm;
					var tokens = res.responseText.match(pattern);
					var editors = _.uniq(_.map(tokens, function(token) {
						return token.replace("{{", "").replace("}}", "").split(",")[2];
					}));
					var sd;
				   	if(sd = authors.signatureDistance(editors)) {
						me.set({sig_dist: sd});
					}
					App.status();
					me.set({authors: editors});
				});
			}
		});

		window.Author = Model.extend({
			defaults: {
				ip: false
			},
			initialize: function() {
				if(this.id.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)) {
					this.set({ip: true});
				}
			}
		});

		window.Template = Model.extend({
			period: function() {
				var m, dates;
			   	if(m = this.match(/\|\s*(date|election_date)\s*=(.*)/)) {
					if(dates = DateParser.parse(m[1])) {
						return dates;
					} else {
						console.log("Cannot parse date in infobox ", m, Article.toString());
					}
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
						obj.type = content.slice(0, stop).trim();
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
			addCountry: function(author, country) {
				country = Countries.get(country);
				if(country) {
					var location = country.clone();
					location.set({id: author.id});
					Article.get('locations').add(location);
					author.set({location: location});
				}
			},
			checkUserPages: function() {
				var locations = Article.get('locations');
				var next = this.find(function(a) {
					return !a.has('page') && !locations.get(a.id);
				});
				if(next) {
					var userPage = new UserPage({title: next.get('urlencoded'), author: next});
					next.set({page: userPage});
					userPage.bind('loaded', this.checkUserPages, this);
					userPage.bind('country', this.addCountry, this);
					App.status('Getting user page for {0}...'.format(next.id));
					userPage.retrieve();
				} else {
					this.trigger('done');
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
				var locations = Article.get('locations');
				_.each(res.anons, function(arr, ts) {
					if(arr && arr.length == 4) {
						user = arr[0];
						if(!locations.get(user)) {
							locations.add({
								id: user,
								region: Countries.countrify(arr[1]),
								latitude: arr[2],
								longitude: arr[3]
							});
						}
						loc = locations.get(user);
						if(articleLoc && !loc.has('distance')) {
							loc.calcDistance(articleLoc);
						}
					} else {
						console.log("Unknown location", arr);
					}
				});

				// adding all editors
				var editors = [], author, bot;
				var bots = Article.get('bots');
				_.each(res.editors, function(obj, name) {
					if(bot = bots.get(name)) {
						bot.set({
							count: obj.all,
							minor: obj.minor
						});
					} else {
						if (name.toLowerCase().endsWith('bot')) {
							console.log("Unregistered bot, counting as author:", name);
						}
						author = new Author({
							id: name,
							urlencoded: obj.urlencoded,
							count: obj.all,
							minor: obj.minor
						});
						if(loc = locations.get(name)) {
							author.set({location: loc});
						}
						editors.push(author)
					}
				});

				App.status();
				return editors;
			}
		});

		window.LocationCollection = Collection.extend({
			model: Location
		});

		window.CountryCollection = LocationCollection.extend({
			initialize: function() {
				this.alt = {
					// WP title -> ISO 3166-1
					'Russia': 'Russian Federation',
					'Georgia (country)': 'Georgia'
				};
				this.geoMapping = {
					// geo-region -> WP title
					'Bahamas': 'The Bahamas',
					'Korea, Republic of': 'South Korea',
					'Ireland': 'Republic of Ireland',
					'Russian Federation': 'Russia'
				};
			},
			distance: function(article, loc) {
				this.each(function(c) {
					c.calcDistance(loc);
				});
			},
			isCountry: function(text) {
				return this.alt[text] && this.get(this.alt[text]) || this.get(text);
			},
			countrify: function(country) {
				if(!country) {
					return "Unknown";
				}
				country = country.trim();
				_.each(this.geoMapping, function(to, from) {
					country = country.replace(from, to);
				});

				if(!this.get(country)) {
					var c = null;
					this.each(function(listItem) {
						if(country.endsWith(listItem.id) || country.startsWith(listItem.id)) {
							c = listItem.id;
						}
					});
					if(c) {
						return c;
					} else {
						console.log("Could not countrify:", country);
					}
				}
				return country;
			}
		});
		window.Countries = new CountryCollection(countries.list);

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
					rev.user = _.escape(rev.user);
					delete rev.comment;
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
			forUser: function(user) {
				return this.filter(function(rev) {
					return rev.get('user') == user;
				});
			},
			fetchAuthors: function() {
				var locations = Article.get('locations');
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
				var current = Article.get('current');
				current.set(rev.toJSON());
				return current;
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
				} else {
					this.trigger('done');
				}
			}
		});

		window.UserPage = Model.extend({
			url: function() {
				return url = "http://{0}.wikipedia.org/w/api.php?action=parse&format=json&callback=?&redirects&prop=text%7Clinks&page=User:{1}".format(Article.get('lang'), encodeURI(this.get('title')));
			},
			parse: function(res) {
				var attr = {};
				if(res.parse) {
					var countries = [], candidate;
					// candidate countries
					_.each(res.parse.links, function(l) {
						if(candidate = Countries.isCountry(l['*'])) {
							countries.push(candidate);
						}
					})

					if(countries.length) {
						var text = res.parse.text['*'];
						var $text = $(text.replace(/<img[^>]+>/ig, "<img>"));
						var country, re, pattern, context, selector;
						var patterns = [
							" comes? from",
							" am from",
							"This user is in",
							" lives? in",
							" currently living in"
						];
						// BEWARE User:Lihaas has multiple hits

						_.each(countries, function(c) {
							if(!country) {
								selector = 'a[title="{0}"]'.format(c.id);
								context = $text.find(selector).closest('div,p,td').text();
								_.each(patterns, function(p) {
									if(!country) {
										re = new RegExp(p);
										if(re.test(context)) {
											country = c.id;
											pattern = p;
										}
									}
								});
							}
						});

						attr.countries = countries;
						if(country) {
							attr.country = country;
							attr.context = context;
							//console.log(this.get('title'), pattern, country);
							this.trigger('country', this.get('author'), country);
						}
					}
				}
				App.status();
				return attr;
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
			label: function(field, text) {
				$(field).parent('.input').prev('label').text(text);
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
			changeEvent: 'change',
			initialize: function() {
				this.form = this.el;
				if(this.model) {
					this.model.bind(this.changeEvent, this.render, this);
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
				}
			}
		});

		window.LocatedView = FieldView.extend({
			changeEvent: 'change:location',
			render: function() {
				if(this.model) {
					var located = this.model.filter(function(author) {
						return author.has('location');
					});
					var label = "Located ({0})".format(_.size(located));
					if(!this.field) {
						this.field = this.textarea(label, "");
					} else {
						this.label(this.field, label);
					}
					this.field.val(_.pluck(located, 'id').join("\n"));
				}
			}
		});

		window.Overview = SectionView.extend({
			title: "Overview",
			render: function() {
				this.row(['span-one-third', 'span-one-third', 'span-one-third']);
				var m = Article;
				var authors = m.get('authors');
				var bots = m.get('bots');
				var text, obj;
				this.link("Title", "{0} ({1})".format(m.get('title'), m.get('lang')), "http://{0}.wikipedia.org/wiki/{1}".format(m.get('lang'), m.get('title')));
				this.display("Article ID", m.get('pageid'));
				if(m.has("first_edit")) {
					obj = m.get('first_edit');
					var user = '<a target="u" href="http://{0}.wikipedia.org/wiki/User:{1}">{1}</a>'.format(m.get('lang'), obj.user);
					text = "{0} by {1}".format($.format.date(new Date(obj.timestamp * 1000), "yyyy-MM-dd hh:mm:ss"), user);
					// FIXME timestamp is not UTC
					this.display("Created", text);
					this.display('Revision count', "{0} ({1} minor, {2} anonymous)"
							.format(m.get('count'), m.get('minor_count'), m.get('anon_count')));
					var ips = _.size(_.compact(authors.pluck('ip')));
					var bots = _.size(_.compact(bots.pluck('count')));
					this.display('Contributors', "{0} ({1} IPs, {2} bots)".format(m.get('editor_count'), ips, bots));
				}
				this.display("Last edited", m.get('touched'));
				if(_.size(authors)) {
					this.column(2);
					var located = [];
					var editors = [];
					var ips = 0;
					var name;
					authors.each(function(author) {
						name = author.id;
						if(author.has('location')) {
							located.push(name);
						}
						editors.push(name);
					});
					this.textarea('Contributors ({0})'.format(_.size(editors)), editors.join('\n'));
					this.textarea('Content ({0})'.format(Article.get('length')), _.escape(Article.get('wikitext')));
					this.column(3);
					this.subview(LocatedView, authors);
					this.subview(LanguageView, Article.get('languages'));
				}

				return this;
			}
		});

		window.HypothesesView = SectionView.extend({
			title: "Hypotheses",
			render: function() {
				this.row(['span-one-third', 'span-one-third', 'span-one-third']);
				var m = Article;
				this.display('Article was created in the first 3 days', m.h1());
				return this;
			}
		});

		window.PropertiesView = SectionView.extend({
			id: "properties",
			title: "Article",
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
						this.display('Start', $.format.date(new Date(start), "yyyy-MM-dd"));
						this.display('End/Status', end ? $.format.date(new Date(end), "yyyy-MM-dd") : 'ongoing');
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
				var locations = Article.get('locations');
				var authors = Article.get('authors');
				if(_.size(locations) && _.size(authors)) {
					this.row(['span-two-thirds', 'span-one-third']);
					var located = authors.filter(function(author) {
						return author.has('location');
					});
					var geoData = _.groupBy(located, function(author) {
						return author.get('location').get('region');
					});
					var geoCount = _.sortBy(_.map(geoData, function(group, region) { 
						return [region, _.reduce(group, function(memo, author) { return memo + author.get('count');}, 0)] 
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
				var m = Article.get('current');
				if(m && m.has('authors')) {
					var locations = Article.get('locations');
					this.subtitle = "revision: {0} time: {1} user: {2}".format(m.id, m.get('timestamp'), m.get('user'));
					this.row(['span-two-thirds', 'span-one-third']);
					var authors = m.get('authors');
					locations = locations.filter(function(loc) {
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
					if(m.has('sig_dist')) {
						this.display("Signature distance", "{0} km".format(m.get('sig_dist').toFixed(3)));
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
			renderTable: function(rows, onSelect) {
				this.table = new google.visualization.DataTable();
				this.table.addColumn('date', 'Date');
				this.table.addColumn('number', 'Sd(km)');
				this.table.addColumn({type: 'string', role: 'annotationText'});
				if(rows) {
					this.table.addRows(rows);
				}
				this.chart = new google.visualization.LineChart(this.div(_.uniqueId("lineChart")));
				if(onSelect) {
					google.visualization.events.addListener(this.chart, 'select', onSelect);
				}
				this.chart.draw(this.table, {width: 800});
			}
		});

		window.LocalnessView = TimeLineChartView.extend({
			title: "Localness",
			render: function() {
				var revisions = Article.get('revisions');
				if(_.size(revisions) && Article.has('location')) {
					App.status("Calculating localness (ca. {0} sec.)...".format(_.size(revisions) >> 8));
					this.row();
					var me = this;
					var rows = [];
					var authors = Article.get('authors');
					var located = revisions.filter(function(rev) {
						var author = authors.get(rev.get('user'));
						return author && author.has('location');
					});
					var sd, dist;
					// incremental signature distance
					var localness = _.memoize(function(i, list) {
						dist = authors.get(list[i].get('user')).get('location').get('distance');
						if(i == 0) {
							return dist;
						}
						return (dist + (i- 1) * localness(i - 1, list)) / i;
					});
					_.each(located, function(rev, index) {
						sd = localness(index, located);
						rows.push([new Date(rev.get('timestamp')), sd, "" + rev.id]);
					});
					var onSelect = function(){
						var sel = me.chart.getSelection()[0];
						var revid = me.table.getValue(sel.row, 2);
						revisions.current(revid);
					};
					this.renderTable(rows, onSelect);
					App.status();
				}
				return this;
			}
		});

		// TODO implement hypotheses
		// TODO categories interface

		// Nice to have
		// TODO make Locations global for re-use
		// TODO town in userpages?
		// TODO include poor mans checkuser
		// TODO compare localness of other languages
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
				this.$group = this.$("#group");
				this.statusEl = $('#status');
				this.cache = $('#cache');
				this.container = $('#content .container');
				this.nav = $('.topbar ul.nav');
			},
			analyzeNext: function() {
				if(window.Article) {
					console.log(Article.toString());
				}
				var next = _.random(Group.models);
				if(next) {
					var article = App.analyzeArticle(next.id);
					article.bind('done', this.analyzeNext, this);
				}
			},
			analyzeGroup: function(input) {
				window.Group = new TemplateEmbedders;
				Group.bind('loaded', this.analyzeNext, this);
				Group.fetchPages(input);
			},
			analyzeArticle: function(input) {
				if(window.Article) {
					this.clear();
				}

				window.Article = new MainArticle;

				var authors = Article.get('authors');
				var revisions = Article.get('revisions');
				var current = Article.get('current');

				var av = new Overview();
				var pv = new PropertiesView();
				var mv = new MapView();
				var sv = new SurvivorView();
				var dv = new LocalnessView();
				var hv = new HypothesesView();

				Article.bind('change:pageid', av.render, av);
				Article.bind('change:location', pv.render, pv);
				Article.bind('change:location', dv.render, dv);
				Article.bind('change:location', Countries.distance, Countries);
				Article.bind('change:sig_dist', mv.render, mv);
				Article.bind('found', av.render, av);
				Article.bind('done', hv.render, hv);

				authors.bind('loaded', av.render, av);
				authors.bind('loaded', mv.render, mv);
				authors.bind('userpages', mv.render, mv);
				authors.bind('userpages', sv.render, sv);
				authors.bind('userpages', dv.render, dv);

				revisions.bind('loaded', dv.render, dv);

				current.bind('change:authors', sv.render, sv);

				// kick things off
				Article.set({input: input});
				return Article;
			},
			status: _.throttle(function(msg) {
				if(!msg) {
					msg = "Ready.";
					var size = JSON.stringify(localStorage).length / 1024 / 1024;
					this.cache.text("Cache {0} MB".format(size.toFixed(2)));
				}
				this.statusEl.text(msg);
			}, 1000),
			clearCache: function() {
				localStorage.clear();
			},
			setItem: function(key, value) {
				value = JSON.stringify(value);
				if(value.length < CACHE_LIMIT) {
					var s = lz77.compress(value);
					try { 
						localStorage.setItem(key, s);
					}
					catch(e) {
						console.log("Quota exceeded. Clearing cache...");
						localStorage.clear();
					} 
				} 
			},
			getItem: function(key) {
				var item = localStorage.getItem(key);
				if(item) {
					item = JSON.parse(lz77.decompress(item));
				}
				return item;
			},
			clear: function() {
				this.status();
				this.$('section > div').remove();
				this.input
					.parents('.clearfix')
					.removeClass('error');
				$('a[href!="#"]', this.nav).remove();

				Article.unbind();
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
				if(this.$group.prop('checked')) {
					this.analyzeGroup(input);
				} else {
					this.analyzeArticle(input);
				}
			},
			analyzeExample: function(e) {
				var input = $(e.target).attr("title");
				var isGroup = false;
				if(input.startsWith('Template:')) {
					input = input.substr(9);
					isGroup = true;
				}
				this.$group.prop('checked', isGroup).change();
				this.input.val(input);
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

			// Playground
			/* 
			var p = new Page({title: "ISO_3166-1"});
			p.bind('additional', function() {
				var $l = $(p.attributes.text).find('.flagicon');
				window.list = [];
				_.each($l, function(l) {
					var link = $(l).next();
					var title = link.attr('title');
					var cp = new Page({title: decodeURI(link.attr('href').substr(6))});
					cp.bind('additional', function() {
						var co;
						if(co = cp.get('location')) {
							co = co.toJSON();
							co.id = title;
							co.region = title;
							list.push(co);
						} else {
							console.log("No coords", title);
						}
					}, cp);
					cp.fetchAdditionalData();
				});
				//console.log(list);
			});
			p.fetchAdditionalData();
			*/
		}
	}
});
