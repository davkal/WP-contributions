define(["jquery", 
		"jquery.dateFormat", 
		"underscore", 
		"backbone", 
		"lz77", 
		"wpdateparser", 
		"wpcoordinatesparser", 
		"countries", 
		"bots", 
		"jquery-ui",
		"order!d3",
		"order!d3.chart",
		'async!http://maps.google.com/maps/api/js?sensor=false',
		'goog!visualization,1,packages:[corechart,geochart]'
	], function($, dateFormat, _, Backbone, lz77, DateParser, CoordsParser, countries, botlist) {

		window.CACHE_LIMIT = 100 * 1000; // (bytes, approx.) keep low, big pages are worth the transfer
		window.GROUP_DELAY = 1 * 1000; // (ms) time before analyzing next article
		window.RE_PARENTHESES = /\([^\)]*\)/g;
		window.RE_WIKI_LINK = /\[\[[^\]]*\]\]/g;

		window.c = function() {
			console.log(arguments);
		};

		// date formatter
		function dtformat(d) {
			return $.format.date(new Date(d), "yyyy-MM-dd HH:mm:ss");
		}
		function dformat(d) {
			return $.format.date(new Date(d), "yyyy-MM-dd");
		}

		// Based on http://trentrichardson.com/2010/04/06/compute-linear-regressions-in-javascript/
		window.linearRegression = function(values){
			var lr = {};
			var n = values.length;
			var sum_x = 0;
			var sum_y = 0;
			var sum_xy = 0;
			var sum_xx = 0;
			var sum_yy = 0;
			var x, y;

			_.each(values, function(v) {
				x = (new Date(v[0])).getTime();
				y = parseInt(v[1]);

				sum_x += x;
				sum_y += y;
				sum_xy += (x*y);
				sum_xx += (x*x);
				sum_yy += (y*y);
			}); 

			lr.slope = (n * sum_xy - sum_x * sum_y) / (n*sum_xx - sum_x * sum_x);
			lr.intercept = (sum_y - lr.slope * sum_x)/n;
			lr.r = (n*sum_xy - sum_x*sum_y)/Math.sqrt((n*sum_xx-sum_x*sum_x)*(n*sum_yy-sum_y*sum_y)) || 0;
			lr.r2 = Math.pow(lr.r, 2);
			lr.df = n - 2;
			lr.t = lr.r * Math.sqrt(lr.df) / Math.sqrt(1 - lr.r2);

			return lr;
		}

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
			has: function(property) {
				return this.filter(function(i){return i.has(property)});
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

		/*
		 * MODELS
		 */

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

		window.Location = Model.extend({
			url: function() {
				return 'http://localhost/~david/quova.php?ip=' + this.get('ip');
			},
			parse: function(res) {
				// JSON from Quova IP locator
				var loc = res.ipinfo.Location;
				var attr = {
					region: loc.CountryData.country.toTitleCase(),
					country_code: loc.CountryData.country_code.toUpperCase(),
					latitude: loc.latitude,
					longitude: loc.longitude,
					located: true
				};
				if(loc.StateData.state_code) {
					attr.state = loc.StateData.state.toTitleCase();
					attr.state_code = loc.StateData.state_code.toUpperCase();
				}
				return attr;
			},
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
			fromArticle: function(candidates, target, signal) {
				var title = candidates.shift();

				// short cut when country
				var country = Countries.isCountry(title);
				if(country) {
					target.set({location: country.clone()});
					target.trigger(signal);
				} else {
					console.log("Trying loc candidate", title);
					var article = new Page({title: title, lang: Article.get('lang')});
					article.bind('done', function() {
						var loc = article.get('location');
						if(loc) {
							loc = loc.clone();
							if(Countries.isCountry(title)) {
								loc.set({region: title});
							}
							target.set({location: loc});
							// loc found, no need to search more
							target.trigger(signal);
						} else if(candidates.length) {
							// no location, look for next candidate
							Location.fromArticle(candidates, target, signal);
						} else {
							// no more candidates, giving up
							target.trigger(signal);
						}
					});
					article.fetchAdditionalData();
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
					if(this.get('ongoing')) {
						return 1; // ongoing
					}
					return 2; // ended
				} 
				return 0; // w/o interval
			},
			toString: function() {
				var str = [this.get('title')];
				var start = this.get('start');
				str.push(start ? dformat(start) : "No start");
				if(this.has('ongoing')) {
					str.push('ongoing');
				} else {
					var end = this.get('end');
					str.push(end ? dformat(end) : "No end");
				}
				var location = this.get('location');
				str.push(location ? location.toString() : "Unknown");
				return str.join(' ');
			},
			parseDates: function($infobox) {
				// TODO try collection candidates and then parse then all by first pattern, ...
				// this would help broken dates that also appear correct in 1st sentence.
				// e.g. "Start date|1908|28|01" Municipal Library Elevator Coup

				var dates, start, end, infobox, dateField;
				// event interval with hcard annotations
				var $start = $('.dtstart', $infobox);
				if(start = $start.text()) {
					start = new Date(start);
					var $end = $('.dtend', $infobox);
					if(end = $end.text()) {
						// end date present
						end = new Date(end);
					} else if($start.parents('td, p').first().text().match(/(ongoing|present)/)) {
						// ongoing
						end = new Date();
					} else {
						// single day event
						end = new Date(start);
						end.setDate(start.getDate() + 1);
					}
					if(!isNaN(start.getTime()) && !isNaN(end.getTime())) {
						dates = [start, end];
					}
				}
				// check parsed templates of dates have not been found yet
				if(!dates && this.has('templates')) {
					if(infobox = this.get('templates').findByType('infobox')) {
						if(dateField = infobox.date()) {
							dates = DateParser.parse(dateField);
							if(!dates) {
								console.log("Cannot parse date in infobox ", dateField, Article.toString());
							}
						}
					}
				}
				if(!dates) {
					dates = DateParser.parse(this.get('sentence').replace(RE_PARENTHESES, ""));
				}
				if(!dates) {
					dates = DateParser.parse(this.get('paragraph').replace(RE_PARENTHESES, ""));
				}
				if(dates) {
					this.set({start: dates[0]});
					this.set({end: dates[1]});
					if(new Date() - this.get('end') < 10*1000) {
						this.set({ongoing: true});
					}
				}
				// TODO prevent false positive, e.g. "Berlin"
			},
			parseLocation: function($text, $infobox) {
				// location from template
				var template, links, csv, tokens, ands = [], candidates = [];
			   	if(template = this.get('templates').findByType('infobox')) {
					var toparse = template.location();
					if(toparse) {
						links = toparse.match(RE_WIKI_LINK);
						links = _.map(links, function(l) {
							// removing brackets and cutting off visible text
							tokens = l.replace(/\[/g, "").replace(/\]/g, "").split('|');
							return tokens[0].trim();
						});
						toparse = toparse.replace(RE_WIKI_LINK, "");
						// removing parentheses
						toparse = toparse.replace(/\(/g, ",").replace(/\)/g, "");

						csv = toparse.split(',');
						csv = _.map(csv, function(v) {
							tokens = v.split('|');
							return _.last(tokens).trim();
						});
						_.each(csv, function(v) {
							if(v.indexOf(' and ') > 0) {
								ands = _.union(ands, v.split(' and '));
							}
						});

						candidates = _.union(candidates, links, csv, ands);
					}
				}

				// look for various location containers
				_.each(['.location', '.flagicon'], function(cls) {
					var container = $(cls, $infobox);
					var link = $('a', container);
					if(!link.length) {
						// sometimes link is next to location div
						link = container.next('a');
					}
					if(link = link.attr('title')) {
						candidates.push(link.trim());
					}
				});

				// check first paragraph for anything
				var links = $text.find('p').first().children('a');
				_.each(links, function(l) {
					if(l.title) {
						candidates.push(l.title.trim());
					}
				});

				candidates =  _.uniq(_.compact(candidates));
				if(_.size(candidates) > 10) {
					//console.log("Too many location candidates, cutting:", candidates.slice(10));
					candidates = candidates.slice(0, 10);
				}
				return candidates;
			},
			fetchAdditionalData: function() {
				var me = this;
				var url = "http://{0}.wikipedia.org/w/api.php?action=parse&format=json&callback=?&".format(this.get('lang'));
				url += this.has('pageid') ? "pageid=" + this.get('pageid') : "redirects&page=" + encodeURI(this.get('title'));
				if(!this.isMain()) {
					url += "&prop=text";
				}
				App.status("HTML for  {0}...".format(this.get('title') || this.get('pageid')));
				$.getJSON(url, function(res){
					if(res.error) {
						me.trigger('done');
						return;
					}
					App.status("Extracting page features...");

					// INSIGHT better to parse the HTML than wikitext
					var text = res.parse.text['*'].replace(/<img[^>]+>/ig, "<img>");
					var $text = $("<wikitext>{0}</wikitext>".format(text));
					var paragraph = $text.find('p').first().text();
					var sentence = paragraph.split('.')[0];
					me.set({
						text: text,
						sentence: sentence, // 1st
						paragraph: paragraph // 1st
					});

					var attr = {};
					var $infobox = $text.find('.infobox').first();

					// article location
					var location = $text.find('#coordinates .geo').first();
					if(!location.length) {
						// coords maybe inside infobox
						location = $('.geo', $infobox).first();
					}
					if(location = location.text()) {
						if(location = CoordsParser.parse(location)) {
							attr.location = new Location(location);
						}
					}
					var locationCandidates;

					if(me.isMain()) {
						if(!attr.location) { 
							// in case no coordinates were found
							locationCandidates = me.parseLocation($text, $infobox);
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
					// short circuit if this is used as helper page
					var signal = me.isMain() ? 'additional' : 'done';
					if(locationCandidates) {
						//console.log("Trying location candidates", locationCandidates.slice(0));
						Location.fromArticle(locationCandidates, me, signal);
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
					var $text = $("<wikitext>{0}</wikitext>".format(text));
					// removing useless markup
					$text.find('ref').replaceWith('');
					$text.find('nowiki').replaceWith('');
					page.wikitext = $text.text();
					page.templates = Templates.fromText(page.wikitext);
				}
				return page;
			}
		});

		window.MainArticle = Page.extend({
			defaults: {
				lang: 'en',
				group: false,
				thorough: false,
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
				this.bind('done', this.results, this);
				this.bind('additional', function() {
					// skip analysis of irrelevant articles when in group mode
					if(!this.get('group') || this.relevant()) {
						authors.retrieve();
					} else {
						this.trigger('done', this);
					}
				}, this);

				authors.bind('done', this.calcSignatureDistance, this);
				authors.bind('done', revisions.calcSignatureDistance, revisions);
				authors.bind('loaded', function() {
					// skip analysis of irrelevant articles when in group mode
					if(this.relevant()) {
						revisions.retrieve();
						this.calcSignatureDistance();
						authors.checkUserPages();
					} else {
						this.trigger('done', this);
					}
				}, this);

				revisions.bind('loaded', revisions.calcSignatureDistance, revisions);
				revisions.bind('loaded', revisions.current, revisions);
				revisions.bind('loaded', languages.fetchNext, languages);

				languages.bind('change', languages.fetchNext, languages);
				languages.bind('done', function(){this.done('languages')}, this);

				authors.bind('done', function(){this.done('authors')}, this);
				revisions.bind('distancedone', function(){this.done('revisiondistances')}, this);
				revisions.bind('authorsdone', function(){this.done('revisionauthors')}, this);

				current.bind('change:id', current.fetchAuthors, current);
				// trigger to load authors for all remaining revisions
				current.bind('authors', revisions.fetchAuthors, revisions);

				this.set({
					authors: authors,
					revisions: revisions,
					locations: locations,
					languages: languages,
					current: current,
					bots: bots
				});
			},
			todos: ['languages', 'authors', 'revisiondistances', 'revisionauthors'],
			done: function(todoItem) {
				this.todos = _.without(this.todos, todoItem);
				if(!_.size(this.todos)) {
					this.trigger('done');
				}
			},
			relevant: function() {
				if(!this.has('location') 
						|| !this.has('start') 
						|| this.get('start') > this.get('created')
						|| this.get('start').getFullYear() < 2001) {
					return false;
				}
				return true;
			},
			results: function() {
				var id = this.get('input');
				var title = this.get('title');

				if(this.has('results') || !this.relevant()) {
					console.log("Article does not qualify:", title);
					App.setItem(id, {id: id, title: title}, true);
					this.trigger('complete');
					return this.get('results') || null;
				}

				var authors = this.get('authors');
				var revisions = this.get('revisions');
				var languages = this.get('languages');

				var res = {}, grouped, location, author, revision, username;
				res.title = title;
				res.input = res.id = id;
				res.summary = this.toString();

				revision = revisions.at(0);
				res.created = new Date(revision.get('timestamp'));
				res.start = this.get('start');
				// TODO disregard when end? was before article was created
				res.end = this.get('end');
				// make start,end an open interval
				res.end.setDate(res.end.getDate() + 1);
				var gr = revisions.groupBy(function(r) {
					var date = new Date(r.get('timestamp'));
					if(date < res.start) {
						return 'before';
					}
					if(date < res.end) {
						return 'during';
					}
					return 'after';
				});

				// H1,H2 timedelta created - started
				res.delta = (res.created - res.start) / 1000 / 60 / 60 / 24; // in days

				// H3 first language
				res.first_lang = languages.first().get('lang');

				// H4 distance of creator
				author = authors.get(revision.get('user'));
				if(author && author.has('location')) {
					res.creator_dist = author.get('location').get('distance');
				} else {
					console.log("No creator location.", title, revision.get('user'));
				}

				// H4,H5,H6,H10 mean distance of authors
				var locations = _.compact(authors.pluck('location'));
				if(locations.length) {
					var dists = _.map(locations, function(l) { return l.get('distance')});
					res.mean_dist = _.sum(dists) / dists.length;
				} else {
					console.log("No author locations.", title);
				}

				// H5 date range "beginning" 3 days
				res.beginning = new Date(res.start);
				res.beginning.setDate(res.beginning.getDate() + 3);
				// beginning is part of during
				if(gr.during || gr.after) {
					var earlies = _.filter(_.compact(_.union(gr.during, gr.after)), function(r) {
						return new Date(r.get('timestamp')) < res.beginning;
					});
					if(earlies.length) {
						gr.beginning = earlies;
					}
				}

				// H5 anon/regs count beginning
				if(gr.beginning) {
					grouped = _.groupBy(gr.beginning, function(r) {
						username = r.get('user');
						if(author = authors.get(username)) {
							return author.get('ip') ? 'anon' : 'reg';
						}
						return 'bot';
					});
					res.early_anon_count = _.size(grouped.anon);
					res.early_registered_count = _.size(grouped.reg);
					res.early_author_count = res.early_anon_count + res.early_registered_count;
				}

				// H6 local/distant count (dist < mean) during event
				if(gr.during) {
					grouped = _.groupBy(gr.during, function(r) {
						username = r.get('user');
						if(author = authors.get(username)) {
							if(location = author.get('location')) {
								return location.get('distance') < res.mean_dist ? 'local' : 'distant';
							}
						}
						return 'nolocation';
					});
					res.during_local_count = _.size(grouped.local);
					res.during_distant_count = _.size(grouped.distant);
					res.during_no_location_count = _.size(grouped.nolocation);
					res.during_located_count = res.during_local_count + res.during_distant_count;
				}

				// H7 size of all revs after end
				if(gr.after) {
					var list = revisions.sample ? _.has(gr.after, 'selected') : gr.after;
					if(list.length > 1) {
						res.after_text_lengths = _.map(list, function(r) {
							return [r.get('timestamp'), r.get('length')];
						});
					}
				}
				
				// H8 anon/regs count after end
				if(gr.after) {
					grouped = _.groupBy(gr.after, function(r) {
						username = r.get('user');
						if(author = authors.get(username)) {
							return author.get('ip') ? 'anon' : 'reg';
						}
						return 'bot';
					});
					res.after_anon_count = _.size(grouped.anon);
					res.after_registered_count = _.size(grouped.reg);
					res.after_author_count = res.after_anon_count + res.after_registered_count;
				}

				// H9 [ts, SD(all)] for all revs after end 
				if(gr.after) {
					var after_sig_dists = [];
					_.each(gr.after, function(r) {
						if(r.has('sig_dist')) {
							after_sig_dists.push([r.get('timestamp'), r.get('sig_dist')]);
						}
					});
					if(after_sig_dists.length > 1) {
						res.after_sig_dists = after_sig_dists;
					}
				}

				// H10 for all revs during count local and distant survivors
				if(gr.during) {
					var list = revisions.sample ? _.has(gr.during, 'selected') : gr.during;
					if(list.length > 1) {
						res.during_local_ratios = _.map(list, function(r) {
							grouped = _.groupBy(r.get('authors'), function(username) {
								if(author = authors.get(username)) {
									if(location = author.get('location')) {
										return location.get('distance') < res.mean_dist ? 'local' : 'distant';
									}
								}
								return 'nolocation';
							});
							return [r.get('timestamp'), _.size(grouped.local) || 0, _.size(grouped.distant) || 0];
						});
					}
				}

				// H11 [ts, SD(survivor)] for all revs after end 
				if(gr.after) {
					var list = revisions.sample ? _.has(gr.after, 'selected') : gr.after;
					list = _.has(list, 'sig_dist_survivors');
					if(list.length > 1) {
						res.after_sig_dists_survivors = _.map(list, function(r) {
							return [r.get('timestamp'), r.get('sig_dist_survivors')];
						});
					}
				}

				App.status();
				this.set({results: res});
				// caching results
				App.setItem(id, res, true);
				this.trigger('complete');
				return res;
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
					// TODO use article candidate mechanism
					// TRY load first revisions and check anon comments for "IP"  (e.g. User:TimBentley)
					// TRY or sequence (anon -> user) with comment "oops this is my IP" (e.g. User:Master%26Expert)
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
							"This user is from",
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

		window.Revision = Model.extend({
			fetchAuthors: function(count, error) {
				if(this.has('authors')) {
					return;
				}
				var me = this;
				var url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(Article.get('pageid'), this.id);
				App.status("Authors present in revision {0}...".format(_.isString(count) && count || this.id));
				var parse = function(res){
					var text = $(res.responseText).text().trim();
					var pattern = /{{#t:[^{}]*}}/gm;
					var tokens = text.match(pattern);
					text = text.replace(pattern, "").replace(/W[\d\.]*, /, "");
					me.set({length: text.length});
					var editors = _.uniq(_.map(tokens, function(token) {
						return token.replace("{{", "").replace("}}", "").split(",")[2];
					}));
					var authors = Article.get('authors');
					var sd = authors.signatureDistance(editors);
				   	if(_.isNumber(sd)) {
						me.set({sig_dist_survivors: sd});
					}
					App.status();
					me.set({authors: editors});
					me.trigger('authors', me);
				};
				var options = {success: parse, url: url, type: 'get'};
				if(error) {
					options.error = error;
				}
				$.ajax(options);
			}
		});

		window.Template = Model.extend({
			date: function() {
				var m;
			   	if(m = this.match(/\|\s*(date|election_date)\s*=(.*)/i)) {
					return m[1];
				} 
			},
			location: function() {
				var m;
			   	if(m = this.match(/\|\s*(place|location)\s*=(.*)/i)) {
					return m[1];
				} 
			},
			match: function(reg) {
				var m = this.get('content').match(reg); 
				return m && _.map(m.slice(1), function(s) {
					return s.trim();
				});
			}
		});

		/*
		 * COLLECTIONS
		 */

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
				if(allCount) {
					return sd / allCount;
				}
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
					if(App.thorough) {
						// check all users
						userPage.bind('loaded', this.checkUserPages, this);
					} else {
						// only first user
						userPage.bind('loaded', function() {this.trigger('done');}, this);
					}
					userPage.bind('country', this.addCountry, this);
					App.status('User page {0}...'.format(next.id));
					userPage.retrieve();
				} else {
					this.trigger('done', this);
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
				// prelimenary
				info.created = new Date(info.first_edit.timestamp * 1000);
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
						if(PMCU[name]) {
							console.log("PMCU", name);
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

		// Template:Infobox_military_conflict
		// Template:Infobox_civil_conflict
		// Template:Infobox_historical_event
		// Category:Political_riots
		// Category:2011_riots

		window.PageList = Collection.extend({
			model: Page,
			offset: null,
			fetchPages: function(title) {
				// template or category?
				this.title = title;
				this.prefix = title.split(':')[0];
				if(this.prefix != 'Template' && this.prefix != 'Category') {
					App.error('Not a valid template or category.');
					return;
				}
				var isTemplate = this.prefix == 'Template';

				this.listkey = isTemplate ? "embeddedin" : "categorymembers";
				this.titlekey = isTemplate ? "eititle" : "cmtitle";
				this.limitkey = isTemplate ? "eilimit" : "cmlimit";
				this.namespace = isTemplate ? "einamespace" : "cmnamespace";

				App.status("Getting article list...");
				this.retrieve();
			},
			url: function() {
				var offset = this.offset || "";
				var url = "http://{0}.wikipedia.org/w/api.php?action=query&list={1}&format=json&{2}={3}&{4}=0&{5}=50&redirects&callback=?{6}".format('en', this.listkey, this.titlekey, this.title, this.namespace, this.limitkey, offset);
				return url;
			},
			parse: function(res) {
				var pages = res.query[this.listkey];
				if(!pages.length) {
					App.error("Invalid template/category.");
					return;
				}
				_.each(pages, function(p) {
					p.id = p.pageid;;
				});
				if(this.continue && res['query-continue']) {
					var key = _.first(_.keys(res['query-continue'][this.listkey]));
					var next = res['query-continue'][this.listkey][key];
					this.offset = "&{0}={1}".format(key, next);
					this.page++;
					App.status("Next template articles ({0})...".format(this.page));
					_.defer(_.bind(this.retrieve, this));
				} else {
					this.offset = null;
					App.status();
				}
				return pages;
			}
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
					App.status("Revisions {0}...".format(this.status(total)));
				} else {
					App.status("Revisions ({0})...".format(article.get('lang')));
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
					this.page = 0;
					this.offset = null;
				}
				App.status();
				return page.revisions;
			},
			calcSignatureDistance: function(caller) {
				if(Article.has('location')) {
					var authors = Article.get('authors');
					var located = this.filter(function(rev) {
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
						rev.set({sig_dist: sd});
					});
					this.trigger('distance', this);
					if(caller != this) {
						this.trigger('distancedone', this);
					}
				}
			},
			forUser: function(user) {
				return this.filter(function(rev) {
					return rev.get('user') == user;
				});
			},
			fetchAuthors: function() {
				var max = 50; // n < 2 * max
				var me = this;
				var thorough = Article.thorough;
				if(!thorough && !this.sample && this.length > max * 2) {
					// limit to sample for text survival analysis
					var mod = Math.round(this.length / max);
					this.each(function(r, i) {
						if(i % mod == 0) {
							r.set({selected: true});
						}
					});
					this.sample = _.size(this.has('selected'));
					console.log("Selected revisions for text analysis", this.sample, this.length);
				}
				var rev = this.find(function(r) {
					// select only sample if population is too big
					return !r.has('authors') && (!me.sample || r.get('selected'));
				});
				if(rev) {
					var me = this;
					var count = this.sample || this.length;
					var onError = function(e) {
						console.error(e);
						me.page--;
						// try again if yahoo strikes
						me.fetchAuthors();

					};
					_.debounce(function() {
						rev.bind('authors', me.fetchAuthors, me);
						me.page++;
						var progress = "{0}/{1}".format(me.page, count);
						rev.fetchAuthors(progress, onError);
					}, 800)();
				} else {
					this.trigger('authorsdone', this);
				}
			},
			current: function(id) {
				var rev = id && this.get(parseInt(id)) || this.last();
				var current = Article.get('current');
				current.set(rev.toJSON());
				return current;
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

		window.Countries = new CountryCollection(countries.list);

		/*
		 * VIEWS
		 */

		window.SectionView = Backbone.View.extend({
			initialize: function() {
				if(this.id || this.title) {
					this.id = this.id || this.title && this.title.toLowerCase();
					this.el = $('#' + this.id);
				}
			},
			div: function(id) {
				var el = this.make('div', {id: id});
				if(this.body) {
					this.body.append(el);
				} else {
					this.el.append(el);
				}
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
			header: function(title, subtitle) {
				return '<div class="page-header"><h1>{0} <small>{1}</small></h1></div>'.format(title || this.title, subtitle || this.subtitle || "");
			},
			column: function(n) {
				this.body = this.$('.row:last > div:nth-child({0})'.format(n));
				this.form = $('form', this.body).last();
			},
			subview: function(cls, model) {
				if(model) {
					return new cls({el: $(this.form), model: model});
				} else {
					return new cls({el: this.body});
				}
			},
			row: function(spans, title, subtitle) {
				//console.log("Rendering", this.title);
				spans = spans || ['span10'];
				var html = this.header(title, subtitle);
				html += '<div class="row">';
				var formClass = spans.length > 1 ? "form-stacked" : "";
				_.each(spans, function(span) {
					html += '<div class="{0}"><form class="{1}"/></div>'.format(span, formClass);
				});
				html += '</div>';
				if(title) {
					$(this.el).append(html);
				} else {
					$(this.el).html(html);
				}
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
					text = "{0} by {1}".format(dtformat(new Date(obj.timestamp * 1000)), user);
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
			h1: function(r) {
				return r.delta ? "{0} ({1})".format(r.delta < 3 ? 'True' : 'False', r.delta.toFixed(1)) : "n/a (no start date).";
			},
			h3: function(r) {
				return "{0} ({1})".format(r.first_lang == 'en' ? 'True' : 'False', r.first_lang);
			},
			h4: function(r) {
				if(_.isUndefined(r.creator_dist)) {
				   return "n/a (no creator location).";
				}
		 		return "{0} ({1} km)".format(r.creator_dist <= r.mean_dist ? 'True' : 'False', r.creator_dist.toFixed(1));
			},
			h5: function(r) {
				if(_.isUndefined(r.early_anon_count)) {
					return "n/a (no early revisions)."
				}
				return "{0} ({1} registered, {2} anonymous)".format(r.early_anon_count > r.early_registered_count ? 'True' : 'False', r.early_registered_count, r.early_anon_count);
			},
			h6: function(r) {
				if(_.isUndefined(r.during_local_count)) {
					return "n/a (no revisions during event)."
				}
				return "{0} ({1} local, {2} distant, {3} unknown)".format(r.during_local_count > r.during_distant_count ? 'True' : 'False', r.during_local_count, r.during_distant_count, r.during_no_location_count);
			},
			h7: function(r) {
				if(_.isUndefined(r.after_text_lengths)) {
					return "n/a (not enough revisions after event)."
				}
				var lr = linearRegression(r.after_text_lengths);
				return "{0} (R: {1}, slope: {2}, t: {3}, df: {4})".format(lr.r < 0 ? "True" : "False", lr.r2.toFixed(2), lr.slope.toFixed(2), lr.t.toFixed(3), lr.df);
			},
			h8: function(r) {
				if(_.isUndefined(r.after_anon_count)) {
					return "n/a (no late revisions)."
				}
				return "{0} ({1} registered, {2} anonymous)".format(r.after_registered_count > r.after_anon_count ? 'True' : 'False', r.after_registered_count, r.after_anon_count);
			},
			h9: function(r) {
				if(_.isUndefined(r.after_sig_dists)) {
					return "n/a (not enough located revisions after event)."
				}
				var lr = linearRegression(r.after_sig_dists);
				return "{0} (R: {1}, slope: {2}, t: {3}, df: {4})".format(lr.r > 0 ? "True" : "False", lr.r2.toFixed(2), lr.slope.toFixed(2), lr.t.toFixed(3), lr.df);
			},
			h10: function(r) {
				if(_.isUndefined(r.during_local_ratios)) {
					return "n/a (no located revisions during event)."
				}
				var moreLocals = 0;
				_.each(r.during_local_ratios, function(arr) {
					moreLocals +=  arr[1] > arr[2] ? 1 : 0;
				});
				return "{0} ({1}/{2} revisions with more locals)".format(r.during_local_ratios.length == moreLocals ? 'True' : 'False', moreLocals, r.during_local_ratios.length);
			},
			h11: function(r) {
				if(_.isUndefined(r.after_sig_dists_survivors)) {
					return "n/a (not enough located revisions after event)."
				}
				var lr = linearRegression(r.after_sig_dists_survivors);
				return "{0} (R: {1}, slope: {2}, t: {3}, df: {4})".format(lr.r > 0 ? "True" : "False", lr.r2.toFixed(2), lr.slope.toFixed(2), lr.t.toFixed(3), lr.df);
			},
			render: function() {
				var r = Article.get('results');
				this.row(['span-one-third', 'span-two-thirds']);
				if(!r) {
					this.display("Article not relevant", "The article does not contain all necessary properties for an analysis.");
					return this;
				}
				// single article hypotheses
				this.display('1. Article was created in the first 3 days', this.h1(r));
				// H2 relates to a group of articles
				this.display('2. Recent articles are created sooner', "n/a (single article).");
				this.display('3. First article was created in English', this.h3(r));
				this.display('4. Creator distance was less than mean distance', this.h4(r));
				this.display('5. Most of early contributors were anonymous', this.h5(r));
				this.display('6. Most of contributions during the event had distance less than mean', this.h6(r));
				this.display('7. Revisions are getting smaller in length after event', this.h7(r));
				this.display('8. Most late contributors were registered users', this.h8(r));
				this.display('9. Spatial distribution less local after event', this.h9(r));
				this.display('10. Text consists of more local contributions during event', this.h10(r));
				this.display('11. Spatial distribution of surviving contribution becomes less local', this.h11(r));

				this.column(2);
				var cols, chart;

				// H7 article length chart
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Length', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.after_text_lengths, null, 600, "Text lengths after event");

				// H9 sig dists after event chart
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Sd(km)', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.after_sig_dists, null, 600, "Signature distance after event");

				// H10 local vs distant column chart
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Local', type: 'number'},
					{label: 'Distant', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.during_local_ratios, null, 600, "Contributor localness of text survival during event");

				// H11 sig dists survivors after chart
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Sd(km)', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.after_sig_dists_survivors, null, 600, "Signature distance (survivors) after event");
				
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
						this.display('Date', dformat(start));
						if(start && end && end - start > 10000) {
							this.display('End/Status', Article.has('ongoing') ? 'ongoing' : dformat(end));
						}
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
				if(rows && rows.length) {
					table.addRows(rows);
					var geoChart = new google.visualization.GeoChart(this.div(_.uniqueId("geoChart")));
					geoChart.draw(table);
				}
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
					if(m.has('sig_dist_survivors')) {
						this.display("Signature distance", "{0} km".format(m.get('sig_dist_survivors').toFixed(3)));
					}
				}
				return this;
			}
		});

		window.BoxChartView = SectionView.extend({
			render: function(data, width) {
				var id = _.uniqueId("box");
				var ct = this.div(id);
				var w = 120,
					h = 240,
					m = [10, 50, 20, 50]; // top right bottom left

				var chart = d3.chart.box()
					.whiskers(iqr(1.5))
					.width(w - m[1] - m[3])
					.height(h - m[0] - m[2]);
				
				var vis = d3.select("#"+id).selectAll("svg")
					.data([data])
					.enter().append("svg")
					.attr("class", "box")
					.attr("width", w)
					.attr("height", h)
					.append("g")
					.attr("transform", "translate(" + m[3] + "," + m[0] + ")")
					.call(chart);

				// Returns a function to compute the interquartile range.
				function iqr(k) {
					return function(d, i) {
						var q1 = d.quartiles[0],
							q3 = d.quartiles[2],
							iqr = (q3 - q1) * k,
							i = -1,
							j = d.length;
						while (d[++i] < q1 - iqr);
						while (d[--j] > q3 + iqr);
						return [i, j];
					};
				}

			}
		});

		window.GoogleChartView = SectionView.extend({
			renderTable: function(type, cols, rows, onSelect, width, title) {
				width = width || 800;
				var config = {
					strictFirstColumnType: true,
					width: width
				};
				if(title) {
					config.title = title;
				}
				var table = new google.visualization.DataTable();
				// need to be added one by one 
				_.each(cols, function(col) {
					table.addColumn(col);
				});
				if(rows) {
					_.each(cols, function(col, index) {
						if(col.type == 'date') {
							_.each(rows, function(row) {
								row[index] = new Date(row[index]);
							});
						}
					});
					table.addRows(rows);
				}
				var ct = this.div(_.uniqueId(type));
				this.chart = new google.visualization[type](ct);
				if(onSelect) {
					google.visualization.events.addListener(this.chart, 'select', onSelect);
				}
				this.chart.draw(table, config);
				return table;
			}
		});

		window.LocalnessView = GoogleChartView.extend({
			title: "Localness",
			render: function() {
				var revisions = Article.get('revisions').has('sig_dist');
				if(_.size(revisions)) {
					this.row();
					var me = this;
					var table;
					var cols = [
						{label: 'Date', type: 'date'},
						{label: 'Sd(km)', type: 'number'},
						{type: 'string', role: 'annotationText'},
						{type: 'string', role: 'tooltip'}
					];
					var rows = _.map(revisions, function(rev, index) {
						return [rev.get('timestamp'), rev.get('sig_dist'), "" + rev.id, "Rev: {0} User: {1}".format(rev.id, rev.get('user'))];
					});
					var onSelect = function(){
						var sel = me.chart.getSelection()[0];
						var revid = table.getValue(sel.row, 2);
						Article.get('revisions').current(revid);
					};
					table = this.renderTable('LineChart', cols, rows, onSelect);
				}
				return this;
			}
		});

		window.GroupHypothesesView = SectionView.extend({
			title: "Hypotheses",
			h1: function(r) {
				// prepare data
				var deltas = _.compact(r.pluck('delta'));
				var delta = _.sum(deltas) / deltas.length;
				// text
				var text =  delta ? "{0} ({1})".format(delta < 3 ? 'True' : 'False', delta.toFixed(1)) : "n/a (no start date).";
				this.row(['span-one-third', 'span-two-thirds'], "H1", "Articles are created with only a short delay after the start date of the event.");
				this.display('Articles were created in the first 3 days', text);
				this.column(2);
				// chart
				var rows = _.map(_.range(Math.floor(_.max(deltas)) + 1), function(d) { return 0 });
				_.each(deltas, function(d) {
					rows[Math.floor(d)]++;
				});
				rows = _.map(rows, function(r, i) {
					return ["{0}".format(i+1), r];
				});
				var chart = this.subview(GoogleChartView);
				var cols = [
					{label: 'Days', type: 'string'},
					{label: 'Articles', type: 'number'}
				];
				chart.renderTable('ColumnChart', cols, rows, null, 600);
			},
			h2: function(r) {
				var rows = r.map(function(res) {
					return [res.get('created'), res.get('delta')];
				});
				var text = "Scatter plot of all delays between event start date and date of earliest revision.";
				this.row(['span-one-third', 'span-two-thirds'], "H2", "The more recent an article, the shorter is the delay between the event start and article creation.");
				this.display('Articles were created in the first 3 days', text);
				this.column(2);
				var chart = this.subview(GoogleChartView);
				var cols = [
					{label: 'Date', type: 'date'},
					{label: 'Delay (d)', type: 'number'}
				];
				chart.renderTable('ScatterChart', cols, rows, null, 600);
			},
			h3: function(r) {
				var langs = _.compact(r.pluck('first_lang'));
				var english = _.filter(langs, function(l) {return l == 'en'});
				var ratio = english.length / langs.length;
				var text =  "{0} ({1}%)".format(ratio > 0.5 ? 'True' : 'False', Math.round(ratio * 100));
				this.row(['span-one-third', 'span-two-thirds'], "H3", "Articles are being created first in the English Wikipedia.");
				this.display('Articles were created in the English Wikipedia first', text);
				this.column(2);
				var rows = _.groupBy(langs, function(l) { return l });
				rows = _.map(rows, function(arr, l) {
					return [l, arr.length];
				});
				var chart = this.subview(GoogleChartView);
				var cols = [
					{label: 'Language', type: 'string'},
					{label: 'Articles', type: 'number'}
				];
				chart.renderTable('ColumnChart', cols, rows, null, 600);
			},
			h4: function(r) {
				var located = r.has('creator_dist');
				var locals = _.filter(located, function(l) {return l.get('creator_dist') <= l.get('mean_dist')});
				var ratio = locals.length / located.length;
				this.row(['span-one-third', 'span-two-thirds'], "H4", "Articles about political events are created by people in the events’ proximity.");
				var text =  "{0} ({1}% of articles with located creator)".format(ratio > 0.5 ? 'True' : 'False', Math.round(ratio * 100));
				this.display("Articles were created in the events' proximity", text);
				this.column(2);
				var rows = [
					['Local', locals.length],
					['Distant', located.length - locals.length],
					['Unknown', r.length - located.length]
				];
				var chart = this.subview(GoogleChartView);
				var cols = [
					{label: 'Distance', type: 'string'},
					{label: 'Articles', type: 'number'}
				];
				chart.renderTable('PieChart', cols, rows, null, 600);
			},
			h5: function(r) {
				var results = r.has('early_author_count');
				var values = _.map(results, function(e) {
					return e.get('early_anon_count') / e.get('early_author_count');
				});

				this.row(['span-one-third', 'span-two-thirds'], "H5", "In the beginning of the event anonymous users contribute more than registered users.");
				this.display("Anonymous contributions in the beginning", "{0} articles have contributions in the first 3 days.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			h6: function(r) {
				var results = r.has('during_located_count');
				var values = _.map(results, function(e) {
					return e.get('during_local_count') / e.get('during_located_count');
				});

				this.row(['span-one-third', 'span-two-thirds'], "H6", "For the duration of the event there are more local contributions than distant ones.");
				this.display("Proporting of local contributions during the event", "{0} articles have located contributions during the event.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			h7: function(r) {
				var results = r.has('after_text_lengths');
				var values = _.map(results, function(res) {
					return linearRegression(res.get('after_text_lengths')).r;
				});

				this.row(['span-one-third', 'span-two-thirds'], "H7", "Articles of a political event that has ended will continuously shrink in size.");
				this.display("Correlation between article age and text length", "{0} articles have contributions after the event.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			h8: function(r) {
				var results = r.has('after_author_count');
				var values = _.map(results, function(e) {
					return e.get('after_anon_count') / e.get('after_author_count');
				});

				this.row(['span-one-third', 'span-two-thirds'], "H8", "After an event has ended, there will be more contributions from registered users than from anonymous ones.");
				this.display("Anonymous contributions in the end", "{0} articles have contributions after the event.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			h9: function(r) {
				var results = r.has('after_sig_dists');
				var values = _.map(results, function(res) {
					return linearRegression(res.get('after_sig_dists')).r;
				});

				this.row(['span-one-third', 'span-two-thirds'], "H9", "After an event has ended, the spatial distribution of the contributors will become less local.");
				this.display("Correlation between article age and localness", "{0} articles have contributions after the event.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			h10: function(r) {
				var results = r.has('during_local_ratios');
				var values = _.map(results, function(res) {
					var ratios = _.map(res.get('during_local_ratios'), function(arr) {
						return [arr[0], arr[1] / (arr[1]+arr[2])];
					});
					return linearRegression(ratios).r;
				});

				this.row(['span-one-third', 'span-two-thirds'], "H10", "For the duration of the event the article text contains more local contributions than distant ones.");
				this.display("Proportion of local contributions staying in the text during the event", "{0} articles have locatable contributions during the event.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			h11: function(r) {
				var results = r.has('after_sig_dists_survivors');
				var values = _.map(results, function(res) {
					return linearRegression(res.get('after_sig_dists_survivors')).r;
				});

				this.row(['span-one-third', 'span-two-thirds'], "H11", "After an event has ended, the spatial distribution of the surviving contributions will become less local.");
				this.display("Correlation between article age and localness", "{0} articles have contributions after the event.".format(results.length));
				if(values.length) {
					this.column(2);
					var chart = this.subview(BoxChartView);
					chart.render(values);
				}
			},
			render: function() {
				var g = Group;
				var r = Results;
				this.row(['span-one-third', 'span-one-third', 'span-one-third']);
				this.link(g.prefix, g.title, "http://{0}.wikipedia.org/wiki/{1}".format('en', g.title));
				if(r.length == 0) {
					this.display("Article group empty", "No articles were found that qualify for analysis.");
				} else {
					this.column(2);
					this.textarea('Articles analyzed ({0})'.format(r.length), r.pluck('title').join('\n'));
					this.column(3);
					var relevant = r.has('summary');
					this.textarea('Articles relevant ({0})'.format(relevant.length), _.pluck(relevant, 'title').join('\n'));

					// render all hypotheses H1 - H11
					var func;
					_.each(_.range(1, 12), function(i) {
						func = "h{0}".format(i);
						this[func] && this[func](r);
					}, this);
				}
				return this;
			}
		});
		
		// TODO qualification counter for each H
		// TODO make Locations global for re-use (user pages)

		// NICE TO HAVE
		// timeline chart with zooming
		// town in userpages?
		// include poor mans checkuser
		// compare localness of other languages
		// you are where you edit

		window.AppView = Backbone.View.extend({
			el: $("body"),
			details: true,
			events: {
				"click #renderResults": "renderResults",
				"click #continueResults": "continueResults",
				"click #cache": "clearCache",
				"click #analyze": "analyzeOnClick",
				"click .example": "analyzeExample",
				"keypress #input": "analyzeOnEnter"
			},
			initialize: function() {
				this.input = this.$("#input");
				this.$render = this.$("#renderResults");
				this.$continue = this.$("#continueResults");
				this.$special = this.$("#special");
				this.statusEl = $('#status');
				this.cache = $('#cache');
				this.container = $('#content .container');
				this.nav = $('.topbar ul.nav');
				this.initAutocomplete();
				this.checkCacheForGroup();
				this.status();
			},
			checkCacheForGroup: function() {
				var group = this.getItem('group');
				if(group) {
					window.Group = new PageList(group.items);
					Group.title = group.title;
					Group.prefix = group.prefix;
					this.$continue.attr('title', "Continue group analysis: {0}".format(group.title));
					// get results from cache, result is present when key with article ID exists
					var key, result;
					window.Results = new Collection;
					for(var i = 0; i < localStorage.length; i++) {
						key = localStorage.key(i);
						if(!isNaN(parseInt(key))) {
							Results.add(this.getItem(key));
						}
					}
					this.groupStatus();
				}
			},
			groupStatus: function() {
				var total = Group.length;
				var done = Results.length;
				var relevant = Results.has('summary');
				this.$continue.text("Continue {0}/{1}".format(done, total));
				this.$render.text("{0} results".format(relevant.length));
				this.$render.toggleClass('disabled', !done);
				this.$continue.toggleClass('disabled', !done);
			},
			initAutocomplete: function() {
				var me = this;
				this.input.autocomplete({
					minLength: 4,
					source: function(request, response) {
						$.ajax({
							url: "http://en.wikipedia.org/w/api.php",
							dataType: "jsonp",
							data: {
								action: "opensearch",
								namespace: "0|10|14",
								format: "json",
								search: request.term
							},
							success: function(data) {
								response(data[1]);
							}
						});
					},
					select: function(event, ui) {
						if(ui.item) {
							me.analyze(ui.item.label);
						}
					},
					open: function() {
						$(this).removeClass("ui-corner-all").addClass("ui-corner-top");
					},
					close: function() {
						$(this).removeClass("ui-corner-top").addClass("ui-corner-all");
					}
				});
			},
			continueResults: function() {
				var todo = _.difference(Group.pluck('id'), Results.pluck('id'));
				this.analyzeNext(todo);
			},
			renderResults: function() {
				var gv = new GroupHypothesesView;
				gv.render();
			},
			analyzeNext: function(todo) {
				if(!todo) {
					todo = _.shuffle(Group.pluck('id'));
					// cache group for stop/continue
					App.setItem('group', {title: Group.title, prefix: Group.prefix, items: Group.toJSON()}, true);
				}
				var delay = Group.length == todo.length ? 0 : GROUP_DELAY;
				var next = todo.pop();
				var me = this;
				if(next) {
					this.groupStatus();
					_.debounce(function() {
						var cached = App.getItem(next);
						if(cached) {
							if(cached.summary) {
								Results.add(cached);
							}
							me.analyzeNext(todo);
						} else {
							var article = me.analyzeArticle(next);
							article.bind('complete', function() {
								var results = article.get('results');
								if(results) {
									Results.add(results);
								}
								me.analyzeNext(todo);
							});
						}
					}, delay)();
				} else {
					console.log("Group analysis complete.");
					Group.trigger('complete');
				}
			},
			analyzeGroup: function(input) {
				window.Group = new PageList;
				window.Results = new Collection;
				this.groupStatus();
				this.clearCache();

				var gv = new GroupHypothesesView;

				Group.bind('loaded', this.analyzeNext, this);
				Group.bind('complete', this.clear, this);
				Group.bind('complete', gv.render, gv);
				Results.bind('add', function(r) {
					console.log("Done:", r.get('summary'));
				});

				// kicking things off
				Group.fetchPages(input);
			},
			analyzeArticle: function(input) {
				if(window.Article) {
					Article.unbind();
					this.clear();
				}

				window.Article = new MainArticle({group: this.group});
				var authors = Article.get('authors');

				var av = new Overview;
				var pv = new PropertiesView;
				var hv = new HypothesesView;

				Article.bind('change:pageid', av.render, av);
				Article.bind('change:location', pv.render, pv);
				Article.bind('change:location', Countries.distance, Countries);
				Article.bind('found', av.render, av);
				Article.bind('change:results', hv.render, hv);
				authors.bind('loaded', av.render, av);

				if(!this.group && google.visualization) { // goole stuff sometimes fails to load
					var revisions = Article.get('revisions');
					var current = Article.get('current');

					var mv = new MapView();
					var sv = new SurvivorView();
					var dv = new LocalnessView();

					Article.bind('change:sig_dist', mv.render, mv);

					authors.bind('loaded', mv.render, mv);
					authors.bind('done', mv.render, mv);
					authors.bind('done', sv.render, sv);
					authors.bind('done', dv.render, dv);

					revisions.bind('distance', dv.render, dv);

					current.bind('change:authors', sv.render, sv);
				}

				var results = App.getItem(input);
				if(results) {
					// showing only results when cached
					Article.set({results: results});
				} else {
					// kick things off
					Article.set({input: input});
				}
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
				this.status();
			},
			setItem: function(key, value, nocheck) {
				value = JSON.stringify(value);
				if(nocheck || !App.group && value.length < CACHE_LIMIT) {
					//console.log("Caching", key);
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
				this.group = input.indexOf(':') >= 0;
				this.thorough = this.$special.prop('checked');
				if(this.group) {
					this.analyzeGroup(input);
				} else {
					this.analyzeArticle(input);
				}
			},
			analyzeExample: function(e) {
				var input = $(e.target).attr("title");
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
			window.PMCU = new Backbone.Collection;
			window.App = new AppView;

			/* runtime 4h
			locateIP = _.debounce(function() {
				var item = PMCU.find(function(m) {
					return !m.has('located');
				});
				if(item) {
					item.bind('change:region', locateIP);
					item.fetch();
				}
			}, 600);

			$.ajax({
				url: 'http://localhost/~david/proxy.php',
				data: {
					url: "http://wikiscanner.virgil.gr/pmcu/?nolimit"
				}, 
				success: function(res) {
					res = res.replace(/<img[^>]+>/ig, "<img>");
					$text = $(res);
					var user, ip, $cell;
					_.each($text.find('tr'), function(tr) {
						$cell = $('td', tr).first();
						if(user = $cell.text()) {
							if(!PMCU.get(user)) {
								ip = $cell.next().text();
								PMCU.add(new Location({id: user, ip: ip}));
						 	}
						}
					});
					locateIP();
				}
			});
			*/

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
