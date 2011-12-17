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
				this.set({input: cfg.input});
			}
		});

		window.Category = Backbone.Collection.extend({
			model: Article
		});

		window.SectionView = Backbone.View.extend({
			tagName: 'section',
			initialize: function(cfg) {
				this.title = cfg.title;
				this.id = cfg.id || cfg.title.toLowerCase();
			},
			div: function(id) {
				var el = this.make('div', {id: id});
				this.body.append(el);
				console.log(el);
				return el;
			},
			display: function(label, value) {
				this.form.append('<div class="clearfix"><label>' + label + '</label><div class="input">' + value + '</div></div>');
			},
			textarea: function(label, value) {
				this.form.append('<div class="clearfix"><label>' + label + '</label><div class="input"><textarea class="xxlarge" rows="6">' + value + '</textarea></div></div>');
			},
			render: function() {
				$(this.el).html('<div class="page-header"><h1>{0}</h1></div><div class="row"><div class="span12"><form /></div></div>'.format(this.title));
				this.body = this.$('.row div');
				this.form = this.$('form');
				$('body').scrollSpy('refresh');
				return this;
			}
		});

		window.AppView = Backbone.View.extend({
			el: $("body"),
			events: {
				"click #clear": "clear",
				"click #analyze": "analyzeOnEnter",
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
				$('section').remove();
				this.input
					.parents('.clearfix')
					.removeClass('error');
				$('.topbar a[href!="#"]').remove();
			},
			addSection: function(title, id) {
				var sec = new SectionView({
					title: title,
					id: id
				});
				this.container.append(sec.render().el);
				this.nav.append('<li><a href="#' + id +'">' + title + '</a></li>');
				$('body').scrollSpy('refresh');
				return sec;
			},
			analyzeOnEnter: function(e) {
				var text = this.input.val();
				if (text && (e.keyCode == 13 || e.type == 'click')) {
					window.article = new Article({input: input});
					analyze(text);
				}
			}
		});

		var init = function() {
			window.App = new AppView;
		};

		var analyze = function(input) {
				App.clear();
				var sec, form;
				App.status("Querying toolserver...");
				var url = "http://toolserver.org/~sonet/api.php?lang=en&article="
					+ encodeURI(input)
					+ "&editors&anons&callback=?"
				$.getJSON(url, function(data){
					if(data.error) {
						$('#titleInput')
							.parents('.clearfix')
							.addClass('error');
						App.status(data.error);
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
		init: init
	}
});
