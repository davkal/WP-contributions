define(["jquery", 
		"jquery.dateFormat", 
		"underscore", 
		"backbone", 
		"lz77", 
		"wpdateparser", 
		"wpcoordinatesparser", 
		"countries", 
		"bots", 
		"pmcu", 
		"jquery-ui",
		"date",
		"order!d3",
		"order!d3.chart",
		'async!http://maps.google.com/maps/api/js?sensor=false',
		'goog!visualization,1,packages:[corechart,geochart,annotatedtimeline,motionchart]'
	], function($, dateFormat, _, Backbone, lz77, DateParser, CoordsParser, countries, botlist, PMCU) {

	window.CACHE_LIMIT = 50 * 1000; // (bytes, approx.) keep low, big pages are worth the transfer
	window.GROUP_DELAY = 5 * 1000; // (ms) time before analyzing next article
	window.GROUP_KEY = "articleGroup";
	window.RE_PARENTHESES = /\([^\)]*\)/g;
	window.RE_SQUARE = /\[[^\]]*\]/g;
	window.RE_WIKI_LINK = /\[\[[^\]]*\]\]/g;
	window.MS_PER_DAY = 1000 * 60 * 60 * 24;
	window.CREATED_TOLERANCE = 3 * MS_PER_DAY;
	window.LOCAL_HARD_LIMIT = 500; // (km) distance limit to be declared local
	window.PROXY_URL = "http://154596.webhosting56.1blu.de/proxy.php";

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
	function mformat(d) {
		return $.format.date(new Date(d), "yyyy-MM");
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

	window.dStats = function(values) {
		values = values.slice(0);
		values.sort(d3.ascending);

		var res = {};
		res.n = _.size(values);
		res.mean = _.avg(values);
		res.median = d3.median(values); 
		res.q1 = d3.quantile(values, .25); 
		res.q3 = d3.quantile(values, .75); 
		res.max = d3.max(values);
		res.min = d3.min(values);

		res.iqr = function(k) {
			var iqr = (res.q3 - res.q1) * k;
			return [res.q1 - iqr, res.q3 + iqr];
		}

		res.outliers = function(k) {
			var iqr = res.iqr(k);
			return _.filter(values, function(num) {
				return num < iqr[0] || num > iqr[1];
			});
		}

		res.cleaned = function() {
			return _.difference(values, res.outliers(2));
		}

		return res;
	};	   

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
				error: function(model, res, options) {
					App.error('Some data could no be retrieved.');
					console.error(arguments);
					App.resume(true);
				},
				success: function(model, res) {
					App.setItem(key, res);
					me.trigger(me.loaded || 'loaded', me);
				}
			});
		}
	});

	window.Collection = Backbone.Collection.extend({
		continue: true,
		append: true,
		limit: 500,
		page: 1,
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
				error: function(model, res, options) {
					App.error('Some data could no be retrieved.');
					console.error(arguments);
					App.resume(true);
				},
				success: function(col, res) {
					App.setItem(key, res);
					if(_.isUndefined(me.offset)) {
						me.trigger(me.loaded || 'loaded', me);
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
			return 'http://154596.webhosting56.1blu.de/quova/quova.php?ip=' + this.get('ip');
		},
		parse: function(res) {
			if(!res) {
				console.log("IP lookup failed", res);
				return;
			}
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
			if(loc) {
				var dist = Location.geodesicDistance(this, loc);
				this.set({distance: dist});
				return dist;
			}
		}
	}, {
		fromArticle: function(candidates, target, signal) {
			if(!_.size(candidates)) {
				return target.trigger(signal);
			}
			var title = candidates.shift();

			// short cut when country
			var country = Countries.isCountry(title);
			if(country) {
				target.set({location: country.clone()});
				target.trigger(signal);
			} else {
				// console.log("Trying loc candidate", title);
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
					} else {
						// no location, look for next candidate
						Location.fromArticle(candidates, target, signal);
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
			if(lat1 == lat2 && long1 == long2) {
				return 0;
			}
			var rad = Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(long1 - long2));
			return Math.abs(rad) * 6372.8;
		}
	});

	window.Page = Model.extend({
		defaults: {
			'lang': 'en'
		},
		loaded: 'found',
		isMain: function() {
			return this == window.Article;
		},
		url: function() {
			App.status("Querying en.wikipedia.org...");
			var input = this.get('input');
			var identifier = isNaN(input) ? "titles={0}".format(encodeURI(input)) : "pageids={0}".format(input);
			var full = this.isMain() ? "&export" : "";
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
		parseCategories: function(wikitext) {
			var pattern = /\[\[Category:([^\]]*)\]\]/gi;
			return _.map(wikitext.match(pattern), function(match) {
				return match.replace(pattern, "$1");
			});
		},
		parseDates: function($infobox) {
			// TODO try collection candidates and then parse then all by first pattern, ...
			// this would help broken dates that also appear correct in 1st sentence.
			// e.g. "Start date|1908|28|01" Municipal Library Elevator Coup
			var dates, start, end, infobox, dateField;
			// event interval with hcard annotations
			var $start = $('.dtstart', $infobox);
			if($start.length) {
				start = Date.parse($start.first().text());
				if(start) {
					if($start.length > 1) {
						end = Date.parse($start.last().text());
					}
					var $end = $('.dtend', $infobox);
					if($end.length) {
						// end date present
						end = Date.parse($end.first().text());
					} else if($start.parents('td, p').first().text().match(/(ongoing|present)/)) {
						// ongoing
						end = new Date;
					} else if(!end){
						// single day event
						end = new Date(start);
						end.setDate(start.getDate() + 1);
					}
					if(!isNaN(start.getTime()) && !isNaN(end.getTime())) {
						// last item is resolution: 0 -> year, 1 -> month, 2 -> day
						dates = [start, end, 2];
					}
				}
			}
			// check parsed templates of dates have not been found yet
			if(!dates && this.has('templates')) {
				if(infobox = this.get('templates').findByType('infobox')) {
					// HACK to ignore country boxes, fixes articles like Berlin
					if(!infobox.match(/demonym/i)) { 
						if(dateField = infobox.date()) {
							dates = DateParser.parse(dateField);
							if(!dates) {
								console.log("Cannot parse date in infobox ", dateField, Article.toString());
							}
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
				this.set({
					start: dates[0],
					end: dates[1],
					date_resolution: dates[2]
				});
				if(new Date() - this.get('end') < 10*1000) {
					this.set({ongoing: true});
				}
			}
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
			var links = $text.children('p').first().children('a');
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
			// getting parsed wikitext, i.e. HTML
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
				var paragraph = $text.children('p').first().text().replace(RE_SQUARE, "");
				var sentence = paragraph.split('.')[0] + ".";
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
				var locationCandidates, country;

				if(me.isMain()) {
					// still have to find out the country
					locationCandidates = me.parseLocation($text, $infobox);
					if(attr.location) {
						// just need to add the country
						if(country = Countries.findCountry(locationCandidates)) {
							attr.location.set({region: country.id});
							locationCandidates = null;
						}
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
				me.set(attr);
				// short circuit if this is used as helper page
				var signal = me.isMain() ? 'additional' : 'done';
				if(_.size(locationCandidates)) {
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
			if(res.query.redirects) {
				page.redirects = res.query.redirects;
			}
			if(res.query.export) {
				var xml = $.parseXML(res.query.export['*']);
				var text = $(xml).find('text').text();
				var $text = $("<wikitext>{0}</wikitext>".format(text));
				// removing useless markup
				$text.find('ref').replaceWith('');
				$text.find('nowiki').replaceWith('');
				page.wikitext = $text.text();
				page.templates = Templates.fromText(page.wikitext);
				page.categories = this.parseCategories(page.wikitext);
			}
			return page;
		}
	});

	window.MainArticle = Page.extend({
		initialize: function() {
			var authors = new Authorship;
			var revisions = new RevisionCollection;
			var languages = new LanguageCollection;
			//var traffic = new PageViews;
			var current = new Revision;
			var bots = new Authorship(_.map(botlist.list, function(b){return {id: b};}));

			this.bind('change:input', this.retrieve, this); 
			this.bind('change:pageid', this.fetchAdditionalData, this); 
			this.bind('done', this.results, this);
			this.bind('additional', function() {
				// skip analysis of irrelevant articles when in group mode
				if(!this.get('group') || !App.skim && this.relevant()) {
					authors.retrieve();
				} else {
					this.trigger('done', this);
				}
			}, this);

			authors.bind('done', this.calcSignatureDistance, this);
			authors.bind('done', revisions.calcSignatureDistance, revisions);
			authors.bind('loaded', function() {
				// skip analysis of irrelevant articles when in group mode
				if(!this.get('group') || this.relevant()) {
					this.calcSignatureDistance();
					revisions.retrieve();
					authors.locateUsers();
				} else {
					this.trigger('done', this);
				}
			}, this);

			// parallel fetching of languages, users and page views
			revisions.bind('done', revisions.calcSignatureDistance, revisions);
			revisions.bind('done', revisions.current, revisions);
			revisions.bind('done', languages.fetchNext, languages);
			if(!this.get('group')) {
				// revisions.bind('done', traffic.retrieve, traffic);
			}

			languages.bind('change', languages.fetchNext, languages);
			languages.bind('done', function(){this.done('languages')}, this);

			authors.bind('done', function(){
				revisions.calcSignatureDistanceSurvivors();
				this.done('authors');
			}, this);
			revisions.bind('distancedone', function(){this.done('revisiondistances')}, this);
			revisions.bind('authorsdone', function(){this.done('revisionauthors')}, this);

			current.bind('change:id', current.retrieve, current);
			// trigger to load authors for all remaining revisions
			current.bind('loaded', revisions.fetchAuthors, revisions);

			this.set({
				authors: authors,
				revisions: revisions,
				languages: languages,
				// traffic: traffic,
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
		citizen: function(loc) {
			var here = this.get('location').get('region');
			if(here) {
				return here == loc.get('region');
			}
		},
		local: function(author, limit) {
			if(author.has('userpage')) {
				return this.citizen(author.get('location'));
			} else {
				return author.get('location').get('distance') <= Math.min(limit, LOCAL_HARD_LIMIT);
			}
		},
		requirements: function() {
			function checkTemplates(a, list) {
				return !a.has("templates") || !a.get('templates').hasTemplates(list);
			}
			function checkCategories(a, list) {
				return !a.has("categories") || !_.size(_.intersect(a.get('categories'), list));
			}
			function checkLocatedAuthors(a) {
				var authors = a.get('authors');
				if(authors.length == 0 || authors.has('location').length / authors.length >= 0.25) {
					return true;
				}
				return _.include(this.todos, 'authors'); // not enough yet, still locating
			}
			return {
				"needs location" : this.has('location'),
				"needs date" : this.has('start'),
				"created after date" : this.has('start') && (!this.has("created") || dformat(this.get('created')) >= dformat(this.get('start') - CREATED_TOLERANCE)),
				"created after 2001" : this.has('start') && this.get('start').getFullYear() > 2001,
				// potential for a lot of fine tuning
				"b/l category" : checkCategories(this, ['Living people']),
				"b/l template" : checkTemplates(this, ['governor', 'officeholder']),
				"25% located": checkLocatedAuthors(this)
			};
		},
		relevant: function(reqs) {
			return _.all(reqs || this.requirements(), function(v, r) { return v; });
		},
		results: function() {
			var article = this;
			if(this.has('results')) {
				return this.get('results');
			}
			var id = this.get('input');
			var title = this.get('title');
			var reqs = this.requirements();
			var res = {
				id: id,
				title: title,
				requirements: reqs,
				analyzed: false // false means irrelevant
			};

			if(!this.has('start') || App.group && !this.relevant(reqs)) {
				console.log("Article does not qualify:", title);
				App.setItem(id, res, true);
				// silent set, dont render useless results
				this.set({results: res}, {silent: true});
				this.trigger('complete');
				return res;
			}

			res.input = id;
			res.analyzed = true;
			res.summary = this.toString();

			if(App.skim) {
				App.setItem(id, res, true);
				this.set({results: res}, {silent: true});
				this.trigger('complete');
				return res;
			}

			var authors = this.get('authors');
			var revisions = this.get('revisions');
			var languages = this.get('languages');

			var grouped, location, author, revision, username, list, count, limit, date;
			revision = revisions.at(0);
			res.created = new Date(revision.get('timestamp'));
			res.start = this.get('start');
			res.end = this.get('end');
			res.date_resolution = this.get('date_resolution');

			// make start,end an open interval
			res.end.setDate(res.end.getDate() + 1);
			res.beginning = new Date(res.start);
			var offset = res.date_resolution > 1 ? 7 : 30;
			res.beginning.setDate(res.beginning.getDate() + offset);
			var gr = revisions.groupBy(function(r) {
				date = new Date(r.get('timestamp'));
				if(date < res.beginning) {
					return 'early';
				}
				return 'later';
			});

			// Stats for locations
			var locations = _.compact(authors.pluck('location'));
			if(locations.length) {
				var dists = _.map(locations, function(l) { return l.get('distance')});
				var stats = dStats(dists);
				res.dist_mean = stats.mean;
				res.dist_q1 = stats.q1;
				res.dist_q3 = stats.q3;

				res.located = locations.length;
				res.located_ratio = locations.length / authors.length;

				count = _.size(authors.has('pmcu'));
				res.located_pmcu = count;
				res.located_pmcu_ratio = count / authors.length;

				count = _.size(authors.has('userpage'));
				res.located_user_pages = count;
				res.located_user_pages_ratio = count / authors.length;
			} else {
				console.log("No author locations.", title);
			}

			// res.hX -> article qualifies for hypothesis X

			// H1,H2 timedelta created - started
			res.delta = (res.created - res.start) / MS_PER_DAY; // in days
			res.h1 = res.h2 = res.date_resolution && res.date_resolution > 0; 
			if(res.h1) {
				res.delta_short = res.date_resolution > 1 ? res.delta <= 7 : res.delta <= 30;
			}

			// H3 first language
			languages.sort();
			res.first_lang = languages.first().get('lang');
			var country = Countries.get(this.get('location').get('region'));
			// qualified when article has country with official langs other than english
			res.h3 = languages.length > 1 && country && country.has('languages') 
				&& !_.include(country.get('languages'), 'en');
			if(res.h3) {
				res.country = country.id;
			}

			// H4 distance of creator
			author = authors.get(revision.get('user'));
			if(location = author.get('location')) {
				res.creator_dist = location.get('distance');
				res.creator_citizen = this.citizen(location);
				res.creator_local = this.local(author, res.dist_q1);
				res.h4 = true;
			} else {
				res.h4 = false;
				//console.log("No creator location.", title, revision.get('user'));
			}

			// general stats on located text survival
			revision = this.get('current');
			var counter = revision.get('counter');
			var located = _.intersect(revisions.located(), revision.get('revisions'));
			res.located_text = _.sum(_.map(located, function(r) {
				return counter[r.id];
			}));
			res.located_text_ratio = res.located_text / revision.get('length');

			// H5 / H6 early stats
			res.h5 = res.h6 = res.date_resolution > 0 && _.size(gr.early);
			if(res.h5) {
				// H5 anon/regs count beginning
				grouped = _.groupBy(gr.early, function(r) {
					username = r.get('user');
					if(author = authors.get(username)) {
						return author.get('ip') ? 'anon' : 'reg';
					}
					return 'bot';
				});
				res.early_anon_count = _.size(grouped.anon);
				res.early_registered_count = _.size(grouped.reg);
				res.early_author_count = res.early_anon_count + res.early_registered_count;
				res.h5 = res.early_author_count >= 10;

				// H6 local/distant count (dist < q1) 
				grouped = _.groupBy(gr.early, function(r) {
					username = r.get('user');
					if(author = authors.get(username)) {
						if(location = author.get('location')) {
							var local = article.local(author, res.dist_q1);
							if(_.isUndefined(local)) {
								return 'nolocation';
							}
							return local ? 'local' : 'distant';
						}
					}
					return 'nolocation';
				});
				res.early_local_count = _.size(grouped.local);
				res.early_distant_count = _.size(grouped.distant);
				res.early_no_location_count = _.size(grouped.nolocation);
				res.early_located_count = res.early_local_count + res.early_distant_count;
				res.h6 = res.early_located_count >= 10;
			}

			// H7 / H8 later stats
			res.h7 = res.h8 = res.date_resolution > 0 && _.size(gr.later) >= 10;
			if(res.h7) {
				var subgrouped, part, ratio;
				// bucket by month
				grouped = _.groupBy(gr.later, function(r) {
					return mformat(r.get('timestamp'));
				});

				// H7 get anons for each bucket
				list = [];
				_.each(grouped, function(arr, ts) {
					subgrouped = _.groupBy(arr, function(r) {
						username = r.get('user');
						if(author = authors.get(username)) {
							return author.get('ip') ? 'anon' : 'reg';
						}
						return 'bot';
					})
					ratio = 0;
					part = _.size(subgrouped.anon);
					if(part) {
						ratio = part / (part + _.size(subgrouped.reg));
					}
					list.push([Date.parse(ts + "-01"), ratio]);
				});
				res.later_anon_vs_reg = list;

				// H8 local/distant count (dist < q1) 
				list = [];
				_.each(grouped, function(arr, ts) {
					subgrouped = _.groupBy(arr, function(r) {
						username = r.get('user');
						if(author = authors.get(username)) {
							if(location = author.get('location')) {
								var local = article.local(author, res.dist_q1);
								if(_.isUndefined(local)) {
									return 'nolocation';
								}
								return local ? 'local' : 'distant';
							}
						}
						return 'nolocation';
					})
					ratio = 0;
					part = _.size(subgrouped.local);
					if(part) {
						ratio = part / (part + _.size(subgrouped.distant));
					}
					list.push([Date.parse(ts + "-01"), ratio]);
				});
				res.later_local_vs_dist = list;
			}

			// H9 and H10, local contribs prevail and local text is likely to stick
			if(gr.later) {
				list = [];
				var last_dist, esurv, tsurv;
				_.each(gr.later, function(r) {
					if(r.has('sig_dist')) {
						last_dist = r.get('sig_dist');
					}
					if(!_.isUndefined(last_dist) && r.has('sig_dist_survivors')) {
						esurv = r.get('sig_dist_survivors');
						tsurv = r.get('sig_dist_survivors_text');
						list.push([
							r.get('timestamp'),
							1, // baseline
							last_dist && !_.isUndefined(esurv) ? esurv / last_dist : 1,
							last_dist && !_.isUndefined(tsurv) ? tsurv / last_dist : 1
						]);
					}
				});
				res.later_sig_dist_ratios = list;
			}
			res.h9 = res.h10 = res.later_sig_dist_ratios && res.later_sig_dist_ratios.length >= 10;

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
				var countries = [], candidate, country;
				// TODO use MainArticle's candidate mechanism
				// TRY load first revisions and check anon comments for "IP"  (e.g. User:TimBentley)
				// TRY check first revision texts, usually more infoboxes present
				// TRY check for the likes of "This user is a member of the Virginia WikiProject"
				// TRY authored pages with geotags (you are where you edit)
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
				}
				if(country) {
					//console.log(this.get('title'), pattern, country);
					attr.country = country;
				} else {
					Unlocatable.add(this);
				}
			}
			App.status();
			return attr;
		}
	});

	window.PageViews = Collection.extend({
		comparator: function(p) {
			return p.get('id');
		},
		url: function() {
			this.current = this.offset || new Date();
			this.current.setDate(1);
			this.title = this.title || Article.get('title');
			var url = "http://stats.grok.se/json/en/{0}/{1}".format(mformat(this.current).replace('-', ""), this.title.replace(/ /g, "_"));
			return PROXY_URL + '?' + $.param({url: url});
		},
		parse: function(res) {
			var me = this, add;
			var views = [];
			_.each(res.daily_views, function(v, d) {
				// cumulative with previous redirect
				if(add = me.get(d)) {
					add.set({views: add.get('views') + v});
				} else {
					views.push({id: d, views: v});
				}
			});
			var created = Article.get('created');
			if(this.continue && this.current > created) {
				this.offset = new Date(this.current);
				this.offset.setMonth(this.offset.getMonth() - 1);
				App.status("Page views for {0}...".format(mformat(this.offset)));
				_.defer(_.bind(this.retrieve, this));
			} else {
				views = _.filter(views, function(v) {
					return new Date(v.id) >= created - MS_PER_DAY;
				});
				delete this.offset;
				if(Article.has("redirects")) {
					var redirects = Article.get("redirects");
					if(redirects.length) {
						this.title = redirects.pop().from;
						_.defer(_.bind(this.retrieve, this));
					}
				}
				App.status();
			}
			return views;
		}
	});

	window.Revision = Model.extend({
		url: function() {
			var url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(Article.get('pageid'), this.id);
			return PROXY_URL + '?' + $.param({url: url});
		},
		sync: function(method, model, options) {
			options.dataType = "html";
			return Backbone.sync.call(this, method, model, options);
		},
		parse: function(text){
			var revisions = Article.get('revisions');
			if(!_.size(revisions)) {
				return;
			}
			var pattern = /{{#t:\d+,\d+,[^}]*}}/g;
			var preamble = /W[\d\.]*, /;
			var tokens = text.match(pattern);
			// getting text lengths by splitting up
			var splits = text.split(pattern);
			splits.shift();
			// removing vandalism API annotations
			text = text.replace(pattern, "").replace(preamble, "");
			this.set({length: text.length});
			var counter = {}, revid, revision;
			_.each(tokens, function(token, index) {
				revid = parseInt(token.replace("{{", "").replace("}}", "").split(",")[1]);
				if(revisions.get(revid)) {
					counter[revid] = splits[index].length + (counter[revid] || 0);
				}
			});
			var survived = _.map(_.keys(counter), function(revid) {
				return revisions.get(revid);
			});
			var editors = _.uniq(_.invoke(survived, 'get', 'user'));
			this.calcSignatureDistanceSurvivors(editors);
			this.calcSignatureDistanceSurvivorsText(editors, counter, survived);
			return {authors: editors, revisions: survived, counter: counter};
		},
		calcSignatureDistanceSurvivors: function(editors) {
			if(Article.has('location')) {
				editors = this.get('authors') || editors;
				if(editors) {
					var authorship = Article.get('authors'), sd;
					if(!_.isUndefined(sd = authorship.signatureDistance(editors))) {
						this.set({sig_dist_survivors: sd});
					}
				}
			}
		},
		calcSignatureDistanceSurvivorsText: function(editors, counter, revisions) {
			if(Article.has('location')) {
				revisions = this.get('revisions') || revisions;
				editors = this.get('authors') || editors;
				counter = this.get('counter') || counter;
				if(counter && editors && revisions) {
					var authorship = Article.get('authors'), sd;
					// convert rev -> length to name -> length
					var users = _.map(revisions, function(r) {
						return [r.get('user'),  counter[r.id]];
					});
					var lengths = {};
					_.each(users, function(arr){
						lengths[arr[0]] = arr[1] + (lengths[arr[0]] || 0);
					});
					if(!_.isUndefined(sd = authorship.signatureDistance(editors, lengths))) {
						this.set({sig_dist_survivors_text: sd});
					}
				}
			}
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
		location: function(user) {
			var author, loc;
			if(author = this.get(user)) {
				if(loc = author.get('location')) {
					return loc;
				}
			}
		},
		signatureDistance: function(authors, counter) {
			var sd = 0, loc, dist, count;
			var allCount = 0;
			this.each(function(author) {
				loc = author.get('location');
				// if authors is set, take only those into account
				if(loc && (!authors|| _.include(authors, author.id))) {
					dist = loc.get('distance');
					// no revision parsing, all authors have edit count, or lookup counter 
					count = (counter ? counter[author.id] : author.get('count')) || 0;
					allCount += count;
					sd += dist * count;
				}
			});
			if(allCount) {
				return sd / allCount;
			}
		},
		addLocation: function(loc) {
			var author = this.get(loc.id);
			if(author) {
				Locations.add(loc.clone());
				var dist = loc.calcDistance(Article.get('location'));
				author.set({location: loc, located: true});
			} else {
				console.error("Author not found authorship.", loc.id);
			}
		},
		addCountry: function(author, country) {
			country = Countries.get(country);
			if(country) {
				var location = country.clone();
				// override country name with author id
				location.set({id: author.id});
				this.addLocation(location);
			}
		},
		locateUsers: function() {
			var authorship = Article.get('authors');
			var next = this.find(function(a) {
				if(a.has('located')) {
					return false;
				}
				if(Unlocatable.get(a.id)) {
					console.log("Recall unlocateable", a.id);
					a.set({located: false});
					return false;
				}
				return !authorship.location(a.id);
			});
			if(next) {
				next.set({located: false});
				// try PMCU username -> IP mapping
				if(PMCU[next.id]) {
					next.set({pmcu: true});
					var loc = new Location({id: next.id, ip: PMCU[next.id]});
					loc.bind('change:located', this.addLocation, this);
					loc.bind('loaded', this.locateUsers, this);
					App.status('IP lookup for {0}...'.format(next.id));
					_.debounce(_.bind(loc.retrieve, loc), 500)();
				} else if(App.thorough || !this.creator_page) {
					// try userpages
					var userPage = new UserPage({title: next.get('urlencoded'), id: next.id});
					if(!App.thorough) {
						// only first user
						this.creator_page = userPage;
					}
					userPage.bind('loaded', this.locateUsers, this);
					userPage.bind('change:country', function(page) {
						next.set({userpage: true});
						this.addCountry(next, page.get('country'))
					}, this);
					App.status('User page {0}...'.format(next.id));
					userPage.retrieve();
				} else {
					// skipping user pages
					_.defer(_.bind(this.locateUsers, this));
				}
			} else {
				this.trigger('done', this);
			}
		},
		url: function() {
			App.status("Querying toolserver...");
			return "http://toolserver.org/~sonet/api.php?lang=en&editors&anons&callback=?&article="
				+ encodeURI(Article.get('title'));
		},
		parse: function(res) {
			if(res.error) {
				App.error("Invalid article.");
				return;
			}
			var info = _.extract(res, ["first_edit", "count", "editor_count", "anon_count", "last_edit", "minor_count"]);
			info.created = new Date(info.first_edit.timestamp * 1000);
			Article.set(info);

			// parsing locations
			var user, loc, dist;
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
				} else {
					console.log("Unknown location", arr);
				}
			});

			// adding all editors
			var editors = [], author, bot, ip;
			var bots = Article.get('bots');
			var articleLoc = Article.get('location');
			_.each(res.editors, function(obj, name) {
				if(bot = bots.get(name)) {
					bot.set({
						count: obj.all,
						minor: obj.minor
					});
				} else {
					if (name.toLowerCase().endsWith('bot')) {
						console.log("User name contains 'bot' but is not a registered bot, counting as author:", name);
					}
					author = new Author({
						id: name,
						urlencoded: obj.urlencoded,
						count: obj.all,
						minor: obj.minor
					});
					if(loc = Locations.get(name)) {
						loc = loc.clone();
						if(articleLoc) {
							loc.calcDistance(articleLoc);
						}
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
		comparator: function(l) {
			return l.has('revisions') && l.get('revisions').first().get('timestamp');
		},
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
				revisions.bind('done', function() {
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
				'Iran, Islamic Republic of': 'Iran',
				'Korea, Republic of': 'South Korea',
				'Ireland': 'Republic of Ireland',
				'Russian Federation': 'Russia'
			};

			// add region property 
			this.each(function(c) {
				c.set({region: c.id});
			});
		},
		findCountry: function(list) {
			return _.first(_.compact(_.map(list, _.bind(this.isCountry, this))));
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

	// Template:Infobox_civil_conflict
	// Template:Infobox_historical_event
	// Category:Political_riots
	// Category:2011_riots

	// Too many irrelevant articles: 
	// Template:Infobox_military_conflict

	window.PageList = Collection.extend({
		model: Page,
		fetchPages: function(title) {
			// template or category?
			this.title = title;
			this.cats = title.split("|");
			this.catIndex = 0;
			var prefix = title.split(':')[0];
			if(prefix != 'Template' && prefix != 'Category') {
				App.error('Not a valid template or category.');
				return;
			}
			var isTemplate = prefix == 'Template';

			this.listkey = isTemplate ? "embeddedin" : "categorymembers";
			this.titlekey = isTemplate ? "eititle" : "cmtitle";
			this.limitkey = isTemplate ? "eilimit" : "cmlimit";
			this.namespace = isTemplate ? "einamespace" : "cmnamespace";
			this.ns = isTemplate || this.lists ? 0 : "0|14";
			this.current = this.cats[this.catIndex];

			App.status("Getting article list...");
			this.retrieve();
		},
		url: function() {
			var offset = this.offset || "";
			var url = "http://{0}.wikipedia.org/w/api.php?action=query&list={1}&format=json&{2}={3}&{4}={5}&{6}=50&redirects&callback=?{7}";
			url = url.format('en', this.listkey, this.titlekey, this.current, this.namespace, this.ns, this.limitkey, offset);
			return url;
		},
		parse: function(res) {
			var results = res.query[this.listkey];
			if(!results.length) {
				App.error("Invalid template/category.");
			}
			var pages = [];
			var sub = [];
			_.each(results, function(p) {
				if(p.ns) {
					sub.push(p.title); // subcategory
				} else {
					p.id = p.pageid;;
					// no duplicates
					if(!this.get(p.id)) {
						pages.push(p);
					}
				}
			}, this);
			// what next?
			if(this.continue && res['query-continue']) {
				// fetch the rest of own members
				var key = _.first(_.keys(res['query-continue'][this.listkey]));
				var next = res['query-continue'][this.listkey][key];
				this.offset = "&{0}={1}".format(key, next);
				this.page++;
				App.status("Next set in articles ({0})...".format(this.page));
				_.defer(_.bind(this.retrieve, this));
			} else if(this.subcats || sub.length) {
				this.offset = "";
				// make this response's sub cats the subcats
				if(!this.subcats) {
					this.subcats = sub; // children of toplevel
				}
				// get next subcategory
				this.current = this.subcats.pop();
				// clean up in case there are more toplevel cats
				if(!this.subcats.length) {
					delete this.subcats;
				}
				App.status("Sub-category: {0}".format(this.current));
				_.defer(_.bind(this.retrieve, this));
			} else if(++this.catIndex < this.cats.length) {
				// next main category
				this.offset = "";
				this.current = this.cats[this.catIndex];
				App.status("Category: {0}".format(this.current));
				_.defer(_.bind(this.retrieve, this));
			} else {
				delete this.offset;
			}
			return pages;
		}
	});

	window.RevisionCollection = Collection.extend({
		model: Revision,
		loaded: 'done',
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
				delete this.offset;
			}
			App.status();
			return page.revisions;
		},
		located: function() {
			var authors = Article.get('authors'), author;
			return this.filter(function(rev) {
				author = authors.get(rev.get('user'));
				return author && author.has('location');
			});
		},
		calcSignatureDistanceSurvivors: function() {
			this.each(function(r) {
				r.calcSignatureDistanceSurvivors();
				r.calcSignatureDistanceSurvivorsText();
			});
		},
		calcSignatureDistance: function(caller) {
			// for all revisions
			if(Article.has('location')) {
				var authorship = Article.get('authors');
				var located = this.located(), sd, dist;
				// incremental signature distance
				var localness = _.memoize(function(i, list) {
					dist = authorship.location(list[i].get('user')).get('distance');
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
			}
			if(caller != this) {
				this.trigger('distancedone', this);
			}
		},
		forUser: function(user) {
			return this.filter(function(rev) {
				return rev.get('user') == user;
			});
		},
		fetchAuthors: function() {
			var me = this;
			if(!this.sampled) {
				// limit to one rev per day or month for text survival analysis
				var ts, chooser, start, beginning, end, cutoff;
				if(start = Article.get('start')) {
					beginning = new Date(start);
					beginning.setDate(beginning.getDate() + 7);
					if(end = Article.get('end')) {
						cutoff = new Date(end);
						cutoff.setMonth(cutoff.getMonth() + 3);
					}
				} else {
					cutoff = Article.get('created');
				}
				var grouped = this.groupBy(function(r) {
					ts = r.get('timestamp');
					chooser = App.thorough && (!cutoff || cutoff > new Date(ts)) || beginning && beginning >= new Date(ts) ? dformat : mformat;
					return chooser(ts);
				});
				_.each(grouped, function(list) {
					list[0].set({selected: true});
				});
				this.sampled = _.size(this.has('selected'));
				console.log("Selected revisions for text analysis", this.sampled, this.length);
			}
			var rev = this.find(function(r) {
				// select only sample if population is too big
				return !r.has('authors') && r.get('selected');
			});
			if(rev) {
				var me = this;
				var count = this.sampled || this.length;
				rev.set({authors: false}); // marking as ready for analysis
				_.debounce(function() {
					rev.bind('loaded', me.fetchAuthors, me);
					me.page++;
					var progress = "{0}/{1}".format(me.page, count);
					App.status("Authors present in revision {0}...".format(progress));
					rev.retrieve();
				}, 800)();
			} else {
				App.status();
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
		hasTemplates: function(list){
			var re = new RegExp("({0})".format(list.join("|")), "i");
			return this.find(function(t) {
				return t.has('type') && t.get('type').match(re);
			});
		},
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
			this.$nav = $('.topbar ul.nav');
		},
		div: function(id, classes) {
			var el = this.make('div', {'id': id, 'class': classes || ''});
			if(this.body) {
				this.body.append(el);
			} else {
				this.el.append(el);
			}
			return el;
		},
		display: function(label, value) {
			this.form.append('<div class="clearfix"><label>' + label + '</label><div class="input"><p>' + value + '</p></div></div>');
			return $(".input p", this.form).last();
		},
		link: function(label, value, href) {
			this.display(label, '<a href="{0}" target="_blank">{1}</a>'.format(href, value));
		},
		label: function(field, text) {
			$(field).parent('.input').prev('label').text(text);
		},
		textarea: function(label, value, rows) {
			rows = rows || 9;
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
			$('a[href="#{0}"]'.format(this.id), this.$nav)
				.text(this.title)
				.parent()
				.removeClass('hidden');
			//$('body').scrollSpy('refresh');
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
				var loaded = this.model.filter(function(a) {
					return a.has('revisions');
				});
				var first = _.first(_.sortBy(loaded, function(a) {
					return a.get('revisions').first().get('timestamp');
				}));
				if(first) {
					if(!this.field) {
						this.field = this.display("Appeared first in language", "");
					}
					var lang = first.get('lang');
					var ts = first.get('revisions').first().get('timestamp');
					this.field.text("{0} at {1}".format(lang, dtformat(ts)));
				}
			}
		}
	});

	window.LocatedView = FieldView.extend({
		changeEvent: 'change:location',
		render: function() {
			if(this.model) {
				var name;
				var located = 0;
				var authors = this.model.map(function(author) {
					name = author.id;
					if(author.has('location')) {
						name += " (located)";
						located++;
					}
					return name;
				});
				var all = this.model.size();
				var ratio = located / all * 100;
				var label = "Contributors ({0}, {1}% located)".format(all, ratio.toFixed(1));
				if(!this.field) {
					this.field = this.textarea(label, "", 6);
				} else {
					this.label(this.field, label);
				}
				this.field.val(authors.join("\n"));
			}
		}
	});

	window.PerformanceView = FieldView.extend({
		changeEvent: 'change:location',
		render: function() {
			if(this.model) {
				var name;
				var all = this.model.size();
				var located = _.size(this.model.has('location'));
				var located_pmcu = _.size(this.model.has('pmcu'));
				var located_userpages = _.size(this.model.has('userpage'));
				var located_baseline = located - located_pmcu - located_userpages;
				function ratio(l) {
					return "{0}%".format((l / all * 100).toFixed(1));
				}
				if(!this.field) {
					this.field = this.display("Contributors located by", "");
				}
				var userpages = App.thorough ? ratio(located_userpages) : "n/a (check Thorough box)"
				this.field.text("IP (anonymous) {0}, IP (PMCU) {1}, user pages {2}".format(ratio(located_baseline), ratio(located_pmcu), userpages));
			}
		}
	});

	window.Overview = SectionView.extend({
		title: "Article",
		id: "overview",
		render: function() {
			var m = Article;
			if(!m.get('pageid')) {
				return;
			}
			this.row(['span-one-third', 'span-one-third', 'span-one-third']);
			this.subtitle = m.get('title');
			this.link("Article ID", "{0} ({1})".format(m.get('pageid'), m.get('lang')), "http://{0}.wikipedia.org/wiki/{1}".format(m.get('lang'), m.get('title')));
			if(m.has('sentence')) {
				this.display('First sentence', m.get('sentence'));
			}

			var authors = m.get('authors');
			var bots = m.get('bots');
			var text, obj;
			if(m.has("first_edit")) {
				this.column(2);
				obj = m.get('first_edit');
				var user = '<a target="u" href="http://{0}.wikipedia.org/wiki/User:{1}">{1}</a>'.format(m.get('lang'), obj.user);
				text = "{0} by {1}".format(dtformat(m.get('created')), user);
				this.display("Created", text);
				this.display('Revision count', "{0} ({1} minor, {2} anonymous)"
						.format(m.get('count'), m.get('minor_count'), m.get('anon_count')));
				var ips = _.size(_.compact(authors.pluck('ip')));
				var bots = _.size(_.compact(bots.pluck('count')));
				this.display('Contributors', "{0} ({1} IPs, {2} bots)".format(m.get('editor_count'), ips, bots));
				this.subview(LanguageView, Article.get('languages'));
			}

			if(_.size(authors)) {
				this.column(3);
				this.subview(LocatedView, authors);
				this.subview(PerformanceView, authors);
			}
			return this;
		}
	});

	window.HypothesesView = SectionView.extend({
		title: "Hypotheses",
		h1: function(r) {
			if(!r.h1) {
				return "n/a (no event date in article)";
			}
			return r.delta ? "{0} ({1})".format(r.delta_short ? 'True' : 'False', r.delta.toFixed(1)) : "n/a (no start date).";
		},
		h3: function(r) {
			return "{0} ({1})".format(r.first_lang == 'en' ? 'True' : 'False', r.first_lang);
		},
		h4: function(r) {
			if(!r.h4) {
				return "n/a (no creator location).";
			}
			var residence = "country unknown";
			if(!_.isUndefined(r.creator_citizen)) {
				residence = r.creator_citizen ? "same country" : "different country";
			}
			return "{0} ({1} km, {2})".format(r.creator_local ? 'True' : 'False', r.creator_dist.toFixed(1), residence);
		},
		h5: function(r) {
			if(!r.h5) {
				return "n/a (no early revisions)."
			}
			return "{0} ({1} registered, {2} anonymous)".format(r.early_anon_count > r.early_registered_count ? 'True' : 'False', r.early_registered_count, r.early_anon_count);
		},
		h6: function(r) {
			if(!r.h6) {
				return "n/a (not enough located early revisions)."
			}
			return "{0} ({1} local, {2} distant, {3} unknown)".format(r.early_local_count > r.early_distant_count ? 'True' : 'False', r.early_local_count, r.early_distant_count, r.early_no_location_count);
		},
		h7: function(r) {
			if(!r.h7) {
				return "n/a (not enough revisions)."
			}
			var lr = linearRegression(r.later_anon_vs_reg);
			return "{0} (R: {1}, slope: {2}, t: {3}, df: {4})".format(lr.r < 0 ? "True" : "False", lr.r.toFixed(2), lr.slope.toFixed(2), lr.t.toFixed(3), lr.df);
		},
		h8: function(r) {
			if(!r.h7) {
				return "n/a (not enough revisions)."
			}
			var lr = linearRegression(r.later_local_vs_dist);
			return "{0} (R: {1}, slope: {2}, t: {3}, df: {4})".format(lr.r < 0 ? "True" : "False", lr.r.toFixed(2), lr.slope.toFixed(2), lr.t.toFixed(3), lr.df);
		},
		h9: function(r) {
			if(!r.h9) {
				return "n/a (not enough located revisions)."
			}
			var ratios = _.map(r.later_sig_dist_ratios, function(arr) {
				return arr[2];
			});
			var stats = dStats(ratios);
			return "{0} (mean: {1}, median: {2}, n: {3})".format(stats.mean < 1 ? 'True' : 'False', stats.mean.toFixed(3), stats.median.toFixed(3), stats.n);
		},
		h10: function(r) {
			if(!r.h10) {
				return "n/a (not enough located revisions)."
			}
			var ratios = _.map(r.later_sig_dist_ratios, function(arr) {
				return arr[3];
			});
			var stats = dStats(ratios);
			return "{0} (mean: {1}, median: {2}, n: {3})".format(stats.mean < 1 ? 'True' : 'False', stats.mean.toFixed(3), stats.median.toFixed(3), stats.n);
		},
		render: function() {
			var r = Article.get('results');
			this.row(['span-one-third', 'span-two-thirds']);
			if(!r) {
				this.display("Article not relevant", "The article does not contain all necessary properties for an analysis.");
				return this;
			}
			// single article hypotheses
			this.display('H1. Article was created after short time', this.h1(r));
			// H2 relates to a group of articles
			this.display('H2. Recent articles are created sooner', "n/a (single article).");
			this.display('H3. First article was created in English', this.h3(r));
			this.display('H4. Creator was local', this.h4(r));
			this.display('H5. Most of early contributors were anonymous', this.h5(r));
			this.display('H6. Most of early contributors were local', this.h6(r));
			this.display('H7. Share of anonymous contributions decreaes over time', this.h7(r));
			this.display('H8. Share of local contributions decreaes over time', this.h8(r));
			this.display('H9. Local contributions are more likely to survive (e.surv ratio)', this.h9(r));
			this.display('H10. Text from local contributions is more likely to survive (t.surv ratio)', this.h10(r));

			this.column(2);
			var cols, chart;

			// H7 anon vs. reg
			if(r.h7) {
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Ratio of anonymous', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.later_anon_vs_reg, "H7. Anonymous vs. registered users");
			}

			// H8 local vs. distant
			if(r.h8) {
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Ratio of locals', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.later_local_vs_dist, "H8. Local vs. distant users");
			}

			// H9 / H10 local stickiness
			if(r.h10) {
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Date', type: 'date'},
					{label: 'Baseline', type: 'number'},
					{label: 'e.surv ratio', type: 'number'},
					{label: 't.surv ratio', type: 'number'}
				];
				chart.renderTable('LineChart', cols, r.later_sig_dist_ratios, "H9, H10. Contributor localness of text survival during event");
			}

			return this;
		}
	});

	window.PropertiesView = SectionView.extend({
		id: "properties",
		title: "Event",
		subtitle: "Geographic location of article",
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
			var map = new google.maps.Map(this.div(_.uniqueId("geoChart"), "gmap"), myOptions);
			var myMarker = new google.maps.Marker({
				map: map,
				position: myLatlng
			});
		},
		render: function() {
			if(!Article.has("title")) {
				return;
			}
			this.row(['span-two-thirds', 'span-one-third']);
			var loc = Article.get('location');
			if(loc && loc.has('latitude')) {
				if(!App.skim) {
					this.renderMap(loc);
				}
			} else {
				this.display("Location", "No location found for article. Cannot display a map.");
			}
			var start = Article.get('start');
			var end = Article.get('end');
			this.column(2);
			if(loc && loc.has('latitude')) {
				this.display('Location', "{0}; {1}".format(loc.get('latitude').toFixed(3), loc.get('longitude').toFixed(3)));
			}
			if(start) {
				var end = end && end - start > 10000 ? dformat(end) : "";
				end = Article.has('ongoing') ? 'ongoing' : end;
				if(end.length) {
					end = " - " + end;
				}
				this.display('Event date', "{0}{1}".format(dformat(start), end));
			}
			var missed_req = [];
			_.each(Article.requirements(), function(v, r) {
				if(!v) {
					missed_req.push(r);
				}
			});
			this.display("Missing event requirements", missed_req.length ? missed_req.join(', ') : "None, this article seems to treat an event.");
			return this;
		}
	});

	window.MapView = SectionView.extend({
		id: "distribution",
		title: "Origins",
		subtitle: "Geographic origin of edits",
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
			var authors = Article.get('authors');
			if(_.size(authors) && _.size(authors.has('location'))) {
				this.row(['span-two-thirds', 'span-one-third']);
				var located = authors.filter(function(author) {
					return author.has('location');
				});
				var geoData = _.groupBy(located, function(author) {
					return author.get('location').get('region');
				});
				var geoCount = _.sortBy(_.map(geoData, function(group, region) {
					return [region, _.sum(group, function(author) { return author.get('count');})];
				}), function(num){return num[1]});
				geoCount.reverse();
				this.renderMap(geoCount);
				this.column(2);
				var total = _.sum(geoCount, function(c){return c[1]});
				this.textarea('Distribution by country <br/>({0} contributions from {1} countries)'.format(total, _.size(geoCount)), geoCount.join('\n'));
				if(Article.has('sig_dist')) {
					this.display("Signature distance", "{0} km".format(Article.get('sig_dist').toFixed(3)));
				}
			}
			return this;
		}
	});

	window.SurvivorView = MapView.extend({
		title: "Text",
		id: "survivors",
		render: function() {
			var m = Article.get('current');
			if(m && m.has('revisions')) {
				this.subtitle = "Geographic origin of survived text in revision {0} by {1} - {2}".format(m.id, m.get('user'), dtformat(m.get('timestamp')));
				this.row(['span-two-thirds', 'span-one-third']);
				// counting all surviving revisions
				var revisions = m.get('revisions');
				var counter = m.get('counter');
				var located = [];
				_.each(revisions, function(r) {
					if(loc = Locations.get(r.get('user'))) {
						located.push([loc.get('region'), counter[r.id]]);
					}
				});
				var geoData = _.groupBy(located, function(arr) {
					return arr[0];
				});
				var geoCount = _.sortBy(_.map(geoData, function(num, key) { 
					return [key, _.sum(num, function(arr) {return arr[1]})];
				}), function(num){return num[1]});
				geoCount.reverse();
				this.renderMap(geoCount);
				this.column(2);
				var total = _.sum(geoCount, function(c){return c[1]});
				var length = m.get('length');
				function ratio(l) {
					return "{0}%".format((l / length * 100).toFixed(2));
				}
				var ratios = _.map(geoCount, function(arr) {
					return "{0}, {1}".format(arr[0], ratio(arr[1]));
				});
				this.textarea('Contribution size by country <br/>(Text length {0}, {1} located, {2} countries)'.format(length, ratio(total), _.size(geoCount)), ratios.join('\n'));
				if(m.has('sig_dist_survivors')) {
					this.display("Signature distance by survived edits", "{0} km".format(m.get('sig_dist_survivors').toFixed(1)));
				}
				if(m.has('sig_dist_survivors_text')) {
					this.display("Signature distance by survived text", "{0} km".format(m.get('sig_dist_survivors_text').toFixed(1)));
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
				.whiskers(iqr(2))
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
		renderTable: function(type, cols, rows, config, listeners) {
			if(_.isString(config)) {
				config = {title: config};
			}
			config = config || {};
			config.strictFirstColumnType = true;
			config.width = config.width || 600;

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
			var ct = this.div(_.uniqueId(type), config.className || 'gchart');
			var chart = new google.visualization[type](ct);
			_.each(listeners, function(fun, ev) {
				google.visualization.events.addListener(chart, ev, fun);
			});
			chart.draw(table, config);
			this.chart = chart;
			return table;
		}
	});

	window.LocalnessView = GoogleChartView.extend({
		title: "Localness",
		subtitle: "Signature distance: average author distance weighted by edit count or text survival",
		render: function() {
			var revisions = Article.get('revisions').has('sig_dist');
			if(_.size(revisions)) {
				this.row(['span16']);
				var me = this;
				var table, start, end;
				var cols = [
					{label: 'Date', type: 'date'},
					{label: 'Sd(km)', type: 'number'},
					{label: 'Sd survived edits(km)', type: 'number'},
					{label: 'Sd survived text(km)', type: 'number'}
				];

				var rows = _.map(revisions, function(rev, index) {
					return [
						rev.get('timestamp'),
						rev.get('sig_dist'),
						rev.get('sig_dist_survivors'),
						rev.get('sig_dist_survivors_text')
					];
				});

				// adding analyzed revisions
				var survivors = Article.get('revisions').has('sig_dist_survivors');
				_.each(survivors, function(rev) {
					if(!rev.has('sig_dist')) {
						rows.push([
							rev.get('timestamp'),
							undefined,
							rev.get('sig_dist_survivors'),
							rev.get('sig_dist_survivors_text')
						]);
					}
				});

				/*
				// adding individual distances
				var authors = Article.get('authors'), author, loc;
				Article.get('revisions').each(function(r) {
					if(author = authors.get(r.get('user'))) {
						if(loc = author.get('location')) {
							rows.push([r.get('timestamp'), undefined, loc.get('distance'), undefined]);
						}
					}
				});

				// adding page views
				var views = Article.get('traffic');
				if(views.length) {
					views.each(function(v) {
						rows.push([v.id, undefined, undefined, v.get('views')]);
					})
				} else {
					// avoiding NaN values
					rows.push([start, undefined, undefined, 0]);
				}
				*/

				var listeners = {
				/*
					'rangechange': function(){
						var range = me.chart.getVisibleChartRange();
						var revisions = Article.get('revisions');
						var latest = revisions.first();
						revisions.each(function(r) {
							if(new Date(r.get('timestamp')) < range.end) {
								latest = r;
							}
						});
						Article.get('revisions').current(latest.id);
					}
				*/
				};

				// finding start and end interval for 7 days
				start = new Date(rows[0][0]);
				end = new Date(start);
				end.setDate(end.getDate() + 8);

				var config = {
					displayExactValues: true,
					zoomStartTime: start, 
					zoomEndTime: end
				};
				table = this.renderTable('AnnotatedTimeLine', cols, rows, config, listeners);
			}
			return this;
		}
	});

	window.SurvivalMotionView = GoogleChartView.extend({
		id: 'time',
		title: "Evolution",
		subtitle: "Temporal development of contributions by country",
		render: function() {
			var revisions = Article.get('revisions').located();
			if(_.size(revisions)) {
				this.row(['span16']);
				var me = this, rows = [], counter = {}, loc, country, table, dist, count;
				var cols = [
					{label: 'Country', type: 'string'},
					{label: 'Date', type: 'date'},
					{label: 'Distance (km)', type: 'number'},
					{label: 'Edits (cumulative)', type: 'number'},
					{label: 'Edits (survived)', type: 'number'},
					{label: 'Text proportion (%)', type: 'number'}
				];

				// initialize countries and edits
				var edits = {}; // country -> cuml. edits
				var dists = {}; // country -> [dist1, dist2, ...]
				_.each(revisions, function(rev) {
					loc = Locations.get(rev.get('user')).get('region');
					edits[loc] = 0;
					dists[loc] = [];
				});

				// preprocess text survival (not every revision has data)
				var survivalText = {};
				var survivalEdits = {};
				var survived = Article.get('revisions').has('revisions');
				_.each(survived, function(rev) {
					var revs = rev.get('revisions');
					var counter = rev.get('counter');
					var length = rev.get('length');
					var date = dformat(rev.get('timestamp'));
					var characters = _.clone(edits);
					var editCount = _.clone(edits); 
					_.each(revs, function(r) {
						if(loc = Locations.get(r.get('user'))) {
							country = loc.get('region');
							characters[country] += counter[r.id];
							editCount[country]++;
						}
					});
					// relative values to article length
					_.each(characters, function(num, country) {
						characters[country] = num / length * 100;
					});
					survivalText[date] = characters;
					survivalEdits[date] = editCount;
				});

				var dated = _.groupBy(revisions, function(r) {
					return dformat(r.get('timestamp'));
				});
				var text = {};
				var revCount = {};
				var authorship = Article.get('authors');
				_.each(dated, function(revs, d) {
					// aggregate edits for each date
					_.each(revs, function(rev) {
						if(loc = authorship.location(rev.get('user'))) {
							country = loc.get('region');
							edits[country]++;
							dists[country].push(loc.get('distance'));
						}
					});
					// current survival rev
					text = survivalText[d] || text;
					revCount = survivalEdits[d] || revCount;
					// render all countries each day
					_.each(edits, function(count, country) {
						dist = _.avg(dists[country]);
						rows.push([country, d, dist, count, revCount[country] || 0, text[country] || 0]);
					});
				});

				// top 10 for each number 
				var grouped = _.groupBy(rows, function(r) {
					return r[0];
				});
				var max = [];
				// for each country find highest values for all measures
				_.each(grouped, function(arr, country) {
					var values = [country];
					_.each(cols, function(col, index) {
						if(col.type == 'number' && index > 2) {
							values[index] = Math.max.apply(this, _.map(arr, function(row) {
								return row[index];
							}));
						}
					});
					max.push(values);
				});
				// rank countries by measure
				var important = [];
				_.each(cols, function(col, index) {
					if(col.type == 'number' && index > 2) {
						var ranked = _.sortBy(max, function(values) {
							return values[index];
						});
						// limit to top 10
						var countries = _.map(ranked.slice(-10), function(values) {
							return values[0];
						});
						important = _.union(important, countries);
					}
				});

				rows = _.filter(rows, function(r) {
					return _.include(important, r[0]);
				});

				var config = {
					height: 400,
					width: 900,
					className: 'gmotion',
					state: '{"xZoomedDataMin":3.0587244208838595,"dimensions":{"iconDimensions":["dim0"]},"yZoomedDataMin":1,"yLambda":1,"xZoomedIn":false,"orderedByY":false,"uniColorForNonSelected":false,"nonSelectedAlpha":0.4,"xZoomedDataMax":14719.22872542966,"yZoomedDataMax":149,"xAxisOption":"2","playDuration":15000,"xLambda":1,"colorOption":"_UNIQUE_COLOR","duration":{"timeUnit":"D","multiplier":1},"orderedByX":false,"showTrails":true,"sizeOption":"3","yZoomedIn":false,"yAxisOption":"3","iconKeySettings":[],"time":"2011-02-15","iconType":"BUBBLE"}'
				};
				table = this.renderTable('MotionChart', cols, rows, config);
			}
			return this;
		}
	});

	window.GroupResultsView = SectionView.extend({
		title: "Group",
		id: "groupresults",
		render: function() {
			var g = Group;
			this.subtitle = g.title;
			var analyzed = g.filter(function(a) {
			   return a.has('analyzed');
			});
			this.row(['span-one-third', 'span-two-thirds']);
			_.each(g.title.split("|"), function(title, index) {
				this.link("Article group {0}".format(index ? index + 1 : ""), title, "http://{0}.wikipedia.org/wiki/{1}".format('en', title));
			}, this);
			var total = _.size(analyzed);
			this.display("Progress", "{0} of {1} articles analyzed ({2}%)".format(total, g.size(), (total * 100 / g.size()).toFixed(1)));
			if(total > 0) {
				var relevant = _.filter(analyzed, function(a) {
					return a.get('analyzed');
				});
				var chart, cols, rows, config;
				var count = _.size(relevant);
				if(count) {
					var located = _.avg(_.map(relevant , function(a){return a.get('located_ratio')})) * 100;
					var located_pmcu = _.avg(_.map(relevant , function(a){return a.get('located_pmcu_ratio')})) * 100;
					var located_userpages = _.avg(_.map(relevant , function(a){return a.get('located_user_pages_ratio')})) * 100;
					var baseline = located - located_pmcu - located_userpages;
					var with_pmcu = located - located_pmcu;
					this.display("Georeferencing authors", "Baseline (anonymous only): {0}%; w/ PMCU: {1}%; w/ PMCU + userpages: {2}%".format(baseline.toFixed(1), with_pmcu.toFixed(1), located.toFixed(1)));

					var located_text = _.avg(_.map(relevant , function(a){return a.get('located_text_ratio')})) * 100;
					this.display("Located text in latest revision", "{0}% (using PMCU and userpages)".format(located_text.toFixed(1)));

					this.column(2);
					chart = this.subview(GoogleChartView);
					cols = [
						{label: 'Hypothesis', type: 'string'},
						{label: 'Not an event article', type: 'number'},
						{label: 'Not qualified', type: 'number'},
						{label: 'Qualified', type: 'number'}
					];
					rows = [];
					var func, not_qualified, qualified;
					_.each(_.range(10), function(i) {
						func = "h{0}".format(i + 1);
						not_qualified = 0;
						qualified = 0;
						_.each(relevant, function(a) { 
							if(a.get(func)) {
								qualified++;
							} else {
								not_qualified++;
							}
						});
						rows.push([func.toUpperCase(), total - qualified - not_qualified, not_qualified, qualified]);
					});
					config = {
						isStacked: true, 
						legend: {position: 'none'},
						title: 'Articles qualified: {0} ({1}% of all)'.format(count, (count * 100 / g.size()).toFixed(1))
					};
					chart.renderTable('ColumnChart', cols, rows, config);
				} else {
					this.display("Article analysis", "No article qualified yet.");
				}
				this.column(2);
				// rejection issues
				chart = this.subview(GoogleChartView);
				cols = [
					{label: 'Hypothesis', type: 'string'},
					{label: 'Articles', type: 'number'}
				];
				var rejections = {}, reqs;
				_.each(_.difference(analyzed, relevant), function(a) {
					reqs = a.get('requirements');
					_.each(reqs, function(value, req) { 
						if(!value) {
							rejections[req] = 1 + (rejections[req] || 0);
						}
					});
				});
				rows = [];
				_.each(rejections, function(num, req) {
					rows.push([req, num]);
				});
				config = {
					hAxis: {slantedText: false}, 
					legend: {position: 'none'},
					title: 'Distribution of articles by missed requirements'
				};
				chart.renderTable('ColumnChart', cols, rows, config);

			}
		}
	});


	window.GroupHypothesesView = SectionView.extend({
		title: "Hypotheses",
		h1: function(results, title, subtitle, total) {
			var grouped = _.groupBy(results, function(r) {
				return r.get('date_resolution') > 1 ? "day" : "month";
			});
				
			var avg_month = _.avg(dStats(_.invoke(grouped.month, 'get', 'delta')).cleaned());
			var avg_day = _.avg(dStats(_.invoke(grouped.day, 'get', 'delta')).cleaned());
			var text = "{0} ({1} days on average, {2} days on average for monthly resolution)".format(avg_day <= 7 && avg_month <= 30 ? 'True' : 'False', 
				avg_day ? avg_day.toFixed(1) : "n/a", 
				avg_month ? avg_month.toFixed(1) : "n/a");
			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display('Articles were created with a short time.', text);
			this.column(2);
			// chart
			var deltas = dStats(_.invoke(results, 'get', 'delta')).cleaned();
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
			chart.renderTable('ColumnChart', cols, rows);
		},
		h2: function(results, title, subtitle, total) {
			var rows = _.map(results, function(r) {
				return [r.get('created'), r.get('delta')];
			});
			var iqr = dStats(_.map(rows, function(arr) {
				return arr[1];
			})).iqr(1.5);
			rows = _.filter(rows, function(arr) {
				return arr[1] >= iqr[0] && arr[1] <= iqr[1];
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			var lr = linearRegression(rows);
			var text = "{0} (R: {1}, slope: {2}, t: {3}, df: {4})".format(lr.r < 0 ? "True" : "False", lr.r.toFixed(2), lr.slope.toFixed(2), lr.t.toFixed(3), lr.df);
			this.display('Recent articles have a shorter delay', text);
			this.display('Scatter plot', "All delays between event start date and date of earliest revision.");
			this.column(2);
			var chart = this.subview(GoogleChartView);
			var cols = [
				{label: 'Date', type: 'date'},
				{label: 'Delay (d)', type: 'number'}
			];
			chart.renderTable('ScatterChart', cols, rows);
		},
		h3: function(results, title, subtitle, total) {
			var langs = _.invoke(results, 'get', 'first_lang');
			var english = _.filter(langs, function(l) {return l == 'en'});
			var ratio = english.length / langs.length;
			var text =  "{0} ({1}%)".format(ratio > 0.5 ? 'True' : 'False', Math.round(ratio * 100));
			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display('Articles were created in the English Wikipedia first', text);
			this.column(2);
			var rows = _.groupBy(langs, function(l) { return l });
			rows = _.map(rows, function(arr, l) {
				return [l, arr.length];
			});
			rows = _.sortBy(rows, function(arr) {
				return arr[1];
			});
			rows.reverse();
			var chart = this.subview(GoogleChartView);
			var cols = [
				{label: 'Language', type: 'string'},
				{label: 'Articles', type: 'number'}
			];
			chart.renderTable('ColumnChart', cols, rows);
		},
		h4: function(results, title, subtitle, total) {
			var residents = _.filter(results, function(r) {
				return r.get('creator_citizen');
			});
			var ratio = residents.length / results.length;
			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			var text =  "{0} ({1}% of articles with located creator)".format(ratio > 0.5 ? 'True' : 'False', Math.round(ratio * 100));
			this.display("Articles were created by a resident", text);
			this.column(2);
			var rows = [
				['Same country', residents.length],
				['Different country', results.length - residents.length],
				['Unknown', total - results.length]
			];
			var chart = this.subview(GoogleChartView);
			var cols = [
				{label: 'Distance', type: 'string'},
				{label: 'Articles', type: 'number'}
			];
			chart.renderTable('PieChart', cols, rows);
		},
		h5: function(results, title, subtitle, total) {
			var values = _.map(results, function(e) {
				return e.get('early_anon_count') / e.get('early_author_count');
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display("Anonymous contributions in the beginning", "{0} articles have contributions in the beginning.".format(results.length));
			if(values.length) {
				this.column(2);
				var chart = this.subview(BoxChartView);
				chart.render(values);
			}
		},
		h6: function(results, title, subtitle) {
			var values = _.map(results, function(e) {
				return e.get('early_local_count') / e.get('early_located_count');
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display("Local contributions in the beginning", "{0} articles have located contributions in the beginning.".format(results.length));
			if(values.length) {
				this.column(2);
				var chart = this.subview(BoxChartView);
				chart.render(values);
			}
		},
		h7: function(results, title, subtitle) {
			var values = _.map(results, function(res) {
				return linearRegression(res.get('later_anon_vs_reg')).r;
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display("Correlation between frequency of anonymous contributions and article age", "{0} articles have contributions.".format(results.length));
			if(values.length) {
				this.column(2);
				var chart = this.subview(BoxChartView);
				chart.render(values);
			}
		},
		h8: function(results, title, subtitle) {
			var values = _.map(results, function(res) {
				return linearRegression(res.get('later_local_vs_dist')).r;
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display("Correlation between frequency of local contributions and article age", "{0} articles have enough located contributions.".format(results.length));
			if(values.length) {
				this.column(2);
				var chart = this.subview(BoxChartView);
				chart.render(values);
			}
		},
		h9: function(results, title, subtitle) {
			var values = _.map(results, function(res) {
				var ratios = _.map(res.get('later_sig_dist_ratios'), function(arr) {
					return arr[2] * 100;
				});
				var stats = dStats(ratios);
				return stats.mean;
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display("Means of e.surv ratios, baseline = 100, lower values suggest local contributions prevailed ", "{0} articles have enough located contributions.".format(results.length));
			if(values.length) {
				this.column(2);
				var chart = this.subview(BoxChartView);
				chart.render(values);
			}
		},
		h10: function(results, title, subtitle) {
			var values = _.map(results, function(res) {
				var ratios = _.map(res.get('later_sig_dist_ratios'), function(arr) {
					return arr[3] * 100;
				});
				var stats = dStats(ratios);
				return stats.mean;
			});

			this.row(['span-one-third', 'span-two-thirds'], title, subtitle);
			this.display("Means of t.surv ratios, baseline = 100, lower values suggest local text prevailed ", "{0} articles have enough located contributions.".format(results.length));
			if(values.length) {
				this.column(2);
				var chart = this.subview(BoxChartView);
				chart.render(values);
			}
		},
		render: function() {
			var g = Group;
			var results = g.has('analyzed');
			if(results.length) {
				// render all hypotheses H1 - H11
				var hs = [
					// H1
					"Articles are created with only a short delay after the start date of the event.",
					// H2
					"The more recent an article, the shorter is the delay between the event start and article creation.",
					// H3
					"Articles are being created first in the English Wikipedia.",
					// H4
					"Articles about political events are created by people in the events’ proximity.",
					// H5
					"In the beginning of the event most contributors were anonymous.",
					// H6
					"In the beginning of the event most contributors were local.",
					// H7
					"The share of anonymous contributions decreases over time.",
					// H8
					"The share of local contributions decreases over time.",
					// H9
					"Local contributions are more likely to survive.",
					// H10
					"Text from local contributions is more likely to survive."
				];
				var list, func, title;
				var total = _.size(g.filter(function(a) {
					return a.get('analyzed');
				}));
				_.each(hs, function(subtitle, i) {
					func = "h{0}".format(i + 1);
					// pre-filtering for relevant results for each H
					list = g.filter(function(a) {
						return a.get(func);
					});
					title = func.toUpperCase();
					if(list.length > 1) {
						this[func] && this[func](list, title, subtitle, total);
					} else {
						this.row(['span-two-thirds', 'span-one-third'], title, subtitle);
						this.display("Not enough articles", "{0} valid results in {1} analyzed articles.".format(list.length, _.size(results)));
					}
				}, this);
			}
			return this;
		}
	});

// TODOS
	
// TODO timeline with dots for articles in group
// TODO mention that the English Wikipedia is searched

// NICE TO HAVE
// wikiproject local pages
// town in userpages?
// you are where you edit

	window.AppView = Backbone.View.extend({
		el: $("body"),
		details: true,
		events: {
			"click #results": "renderGroup",
			"click #continue": "continueBtn",
			"click #cache": "clearCache",
			"click #download": "download",
			"click #stop": "stop",
			"click #clear": "clear",
			"click #analyze": "analyzeOnClick",
			"click #skim": "skim",
			"click #examples button": "analyzeExample",
			"keypress #input": "analyzeOnEnter"
		},
		initialize: function() {
			this.input = this.$("#input");
			this.$analyze = this.$("#analyze");
			this.$continue = this.$("#continue");
			this.$download = this.$("#download");
			this.$results = this.$("#results");
			this.$skim = this.$("#skim");
			this.$clear = this.$("#clear");
			this.$stop = this.$("#stop");
			this.$special = this.$("#special");
			this.$examples = this.$("#examples button");
			this.statusEl = $('#status');
			this.cache = $('#cache');
			this.container = $('#content .container');
			this.nav = $('.topbar ul.nav');
			this.$('.search .btn').removeClass('disabled');
			this.$examples.removeClass('disabled');
			this.$('.search input').removeAttr('disabled');
			this.cache.hover(function() {$(this).addClass('danger');}, function() {$(this).removeClass("danger")});
			this.initAutocomplete();
			this.checkCacheForGroup();
			this.status(window.google ? null : "Missing JS libraries.");

			window.Locations = new LocationCollection;
			window.Unlocatable = new Backbone.Collection;
		},
		download: function() {
			window.open('data:text/json;charset=utf-8,' + JSON.stringify(Group));
			return false;
		},
		checkCacheForGroup: function() {
			var group = this.getItem(GROUP_KEY);
			if(group) {
				window.Group = new PageList(group.items);
				Group.title = group.title;
				Group.skim = group.skim;
				// get results from cache, result is present when key with article ID exists
				var key, result, article;
				for(var i = 0; i < localStorage.length; i++) {
					key = localStorage.key(i);
					if(article = Group.get(key)) {
						result = this.getItem(key);
						article.set(result);
					}
				}
				this.attachGroupEvents();
				// show current results
				var gr = new GroupResultsView;
				gr.render();
				// buttons
				this.$analyze.hide();
				if(Group.length == Group.has('analyzed').length) {
					this.$clear.show();
				} else {
					this.$continue.show();
				}
				this.$results.show();
				this.input.val(group.title);
			}
		},
		attachGroupEvents: function() {
			Group.bind('loaded', this.analyzeNext, this);
			Group.bind('complete', this.renderGroup, this);
			Group.bind('change:summary', function(r) {
				console.log("Done:", r.get('summary'));
			});
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
		continueBtn: function() {
			this.$results.hide();
			this.$continue.hide();
			this.$analyze.hide();
			this.$stop.show();
			this.resume();
			return false;
		},
		resume: function(recover) {
			this.group = !recover || App.group;
			this.skim = Group.skim;
			this.input.val(Group.title);
			var todo = Group.filter(function(a) { return !a.has('analyzed'); });
			var key, result, article;
			// clear cache from non-group items
			for(var i = 0; i < localStorage.length; i++) {
				key = localStorage.key(i);
				if(key != GROUP_KEY && !Group.get(key)) {
					localStorage.removeItem(key);
				}
			}
			this.analyzeNext(_.invoke(todo, 'get', 'id'));
		},
		renderArticle: function() {
			// TODO implement
		},
		renderGroup: function() {
			this.reset();
			var gr = new GroupResultsView;
			gr.render();
			var gv = new GroupHypothesesView;
			gv.render();
			this.input.val(Group.title);
			this.$stop.hide();
			this.$analyze.hide();
			this.$clear.show();
			this.$download.show();
			return false;
		},
		analyzeNext: function(todo) {
			if(!todo || !_.isArray(todo)) {
				todo = _.shuffle(Group.pluck('id'));
				// cache group for stop/continue
				App.setItem(GROUP_KEY, {title: Group.title, items: Group.toJSON(), skim: App.skim}, true);
			}
			var delay = Group.length == todo.length ? 0 : GROUP_DELAY;
			if(App.skim) {
				delay = delay / 10;
			}
			var next = todo.pop();
			var me = this;
			if(next) {
				App.status("Next article: {0}".format(next));
				_.debounce(function() {
					var cached = App.getItem(next);
					var groupStore = Group.get(next);
					if(cached) {
						groupStore.set(cached);
						me.analyzeNext(todo);
					} else {
						var article = me.analyzeArticle(next);
						article.bind('complete', function() {
							// get from results from MainArticle and apply to Group entry
							var results = article.get('results');
							if(results) {
								groupStore.set(results);
							}
							me.analyzeNext(todo);
						});
					}
				}, delay)();
			} else {
				Article.unbind();
				Article.clear();
				console.log("Group analysis complete.");
				Group.trigger('complete');
			}
		},
		analyzeGroup: function(input) {
			window.Group = new PageList;
			this.attachGroupEvents();
			// kicking things off
			Group.fetchPages(input);
		},
		analyzeArticle: function(input) {
			this.input.addClass("disabled");
			this.reset();

			window.Article = new MainArticle({group: this.group});
			var authors = Article.get('authors');

			if(App.group && !App.skim) {
				var gr = new GroupResultsView;
				gr.render();
			}

			var av = new Overview;
			var pv = new PropertiesView;
			var hv = new HypothesesView;

			Article.bind('change:pageid', av.render, av);
			Article.bind('additional', av.render, av);
			Article.bind('additional', pv.render, pv);
			Article.bind('found', av.render, av);
			Article.bind('change:results', hv.render, hv);

			authors.bind('loaded', av.render, av);

			if(!this.group && google.visualization) { // goole stuff sometimes fails to load
				var revisions = Article.get('revisions');
				var current = Article.get('current');
				// var traffic = Article.get('traffic');

				var mv = new MapView();
				var sv = new SurvivorView();
				var dv = new LocalnessView();
				var tv = new SurvivalMotionView();

				Article.bind('change:sig_dist', mv.render, mv);
				Article.bind('complete', function() {
					this.$stop.hide();
					this.$clear.show();
				}, this);

				authors.bind('loaded', mv.render, mv);
				authors.bind('done', mv.render, mv);
				authors.bind('done', sv.render, sv);
				authors.bind('done', tv.render, tv);
				authors.bind('done', dv.render, dv);

				revisions.bind('distance', dv.render, dv);
				revisions.bind('authorsdone', dv.render, dv);
				revisions.bind('authorsdone', tv.render, tv);

				current.bind('change:authors', sv.render, sv);

				// traffic.bind('loaded', dv.render, dv);
			}

			// kick things off
			Article.set({input: input});
			return Article;
		},
		status: function(msg) {
			this.statusEl.text(msg || "Ready.");
			this.cacheStatus();
		},
		cacheStatus: _.debounce(function() {
			var size = JSON.stringify(localStorage).length / 1024 / 1024;
			App.cache.text("Cache {0} MB".format(size.toFixed(2)));
		}, 5000),
		clearCache: function() {
			localStorage.clear();
			window.location.reload(true);
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
		focus: function() {
			if(this.input.val()) {
				this.stop();
			}
			this.reset();
		},
		reset: function() {
			this.status();
			this.$('section > div').remove();
			this.input
				.parents('.clearfix')
				.removeClass('error');
			$('a[href!="#"]', this.nav)
				.parent()
				.addClass('hidden');
			var me = this;
			_.defer(function() {
				me.input.autocomplete('close');
			});
		},
		error: function(text) {
			$('#input')
				.parents('.clearfix')
				.addClass('error');
			App.status(text);
		}, 
		clear: function() {
			if(App.group) {
				this.clearCache();
				return false;
			} else {
				return true;
			}
		},
		stop: function() {
			this.wipeout();
			this.$stop.hide();
			this.$clear.show();
			if(App.group) {
				this.$results.show();
				this.$download.show();
			}
			return false;
		},
		wipeout: function() {
			if(window.Group) {
				Group.unbind();
				Group.reset();
			}
			if(window.Article) {
				Article.unbind();
				_.each(_.keys(Article.attributes), function(key) {
					var attr = Article.attributes[key];
					attr.unbind && attr.unbind();
					attr.reset && attr.reset();
				});
			}
		},
		skim: function() {
			this.$skim.hide();
			this.analyze(this.input.val(), true);
			return false;
		},
		analyze: function(input, skim) {
			App.skim = !!skim;
			this.wipeout();
			this.reset();
			this.$analyze.hide();
			this.$stop.show();
			this.input.blur();
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
		analyzeOnEnter: _.throttle(function(e) {
			var text = this.input.val();
			if(!text) {
				return;
			}
			var group = text.indexOf(':') >= 0;
			if(group) {
				this.$skim.show();
			} else {
				this.$skim.hide();
			}
			if (group || (e.keyCode != 13)) {
				return;
			}
			this.analyze(text);
			return false;
		}, 1000)
	});


	return {
		init: function() {
			window.App = new AppView;
			window.PMCU = PMCU;

			/* runtime 4h
			locateIP = _.debounce(function() {
				var item = PMCU.find(function(m) {
					return !m.has('located');
				});
				if(item) {
					item.bind('change:region', locateIP);
					item.fetch();
				}
			}, 800);
			*/

			// Playground
			/* 
			var p = new Page({title: "List_of_ISO_639-1_codes"});
			p.bind('done', function() {
				window.list = {};
				var $l = $(p.attributes.text).siblings('.wikitable');
				_.each($("tr", $l), function(l) {
					var code = $(l).children('td:nth-child(5)').text();
					var link = $('td:nth-child(3) a', l).first().text();
					if(code.length == 2) { 
						list[link] = code;
					}
				});
				window.list2 = {};
				p = new Page({title: "List_of_official_languages_by_state"});
				p.bind('done', function() {
					$l = $(p.attributes.text).find('.flagicon');
					_.each($l, function(l) {
						var country = $(l).next().attr('title');
						list2[country] = [];
						var langs = $(l).parent().parent().children('ul').first().children('li');
						_.each(langs, function(lang) {
							var candidate = $(lang).text();
							_.each(_.keys(list), function(k) {
								if(candidate.startsWith(k)) {
									list2[country].push(list[k]);
								}
							});
						});
					});
					window.list3 = _.map(countries.list, function(c) {
						delete c.region;
						c.languages = list2[c.id];
						return c;
					});
				});
				p.fetchAdditionalData();
			});
			p.fetchAdditionalData();
			*/
		}
	}
});
