String.prototype.endsWith = function (suffix) {
	  return (this.substr(this.length - suffix.length) === suffix);
}

String.prototype.startsWith = function(prefix) {
	  return (this.substr(0, prefix.length) === prefix);
}

String.prototype.format = function() {
    var s = this,
        i = arguments.length;

    while (i--) {
        s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), arguments[i]);
    }
    return s;
};

require(["jquery", 
		"jquery.dateFormat", 
		"ui", 
		"underscore", 
		"countries", 
		"bootstrap-alerts",
		"bootstrap-scrollspy",
		"jquery.xdomainajax",
		'goog!visualization,1,packages:[corechart,geochart]'
	], function($, dateFormat, ui, _, countries) {
    $(function() {
        $('#clear').click(function(){
			$('#titleInput').val('');
			ui.clear();
			ui.status();
		});
        $('#analyze').click(function(){
			ui.clear();
			var sec, form;
			var input = $('#titleInput').val();
			if(input) {
				ui.status("Querying toolserver...");
				var url = "http://toolserver.org/~sonet/api.php?lang=en&article="
					+ encodeURI(input)
					+ "&editors&anons&callback=?"
				$.getJSON(url, function(data){
					if(data.error) {
						$('#titleInput')
							.parents('.clearfix')
							.addClass('error');
						ui.status(data.error);
						return;
					} else {
						ui.status();
					}
					sec = ui.section("Overview");
					form = ui.form(sec);
					ui.display(form, 'Created', "{0} by {1}".format($.format.date(new Date(data.first_edit.timestamp * 1000), "yyyy-MM-dd hh:mm:ss"), data.first_edit.user));
					ui.display(form, 'Revision count', "{0} ({1} minor)".format(data.count, data.minor_count));
					ui.display(form, 'Contributors', "{0} ({1} anonymous)".format(data.editor_count, data.anon_count));

					sec = ui.section("Contributors");
					form = ui.form(sec);
					var editors = _.keys(data.editors);
					var anons = _.pluck(_.values(data.anons), 0);
					ui.textarea(form, 'All', editors.join('\n'));
					ui.textarea(form, 'Anonmymous users', anons.join('\n'));

					sec = ui.section("Distribution");
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
					var geoChart = new google.visualization.GeoChart(_.first(ui.div(sec, "geoChart")));
					geoChart.draw(table);
					form = ui.form(sec);
					ui.textarea(form, 'Anonymous grouped by country', geoCount.join('\n'));

					url = "http://en.wikipedia.org/w/api.php?action=query&prop=info&format=json&callback=?&titles="
						+ encodeURI(input)
					ui.status("Querying en.wikipedia.org...")
					$.getJSON(url, function(data){
						ui.status();
						var page = _.first(_.values(data.query.pages));
						var revid = page.lastrevid;
						var pageid = page.pageid;
						console.log(page);
						url = "http://en.collaborativetrust.com/WikiTrust/RemoteAPI?method=wikimarkup&pageid={0}&revid={1}".format(pageid, revid);
						ui.status("Querying WikiTrust...");
						$.get(url, function(res){
							ui.status();
							var pattern = /{{#t:[^{}]*}}/gm;
							var tokens = res.responseText.match(pattern);
							var survivors = _.map(tokens, function(token) {
								return token.replace("{{", "").replace("}}", "").split(",")[2];
							});

							sec = ui.section("Survivors");
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
							geoChart = new google.visualization.GeoChart(_.first(ui.div(sec, "geoChart2")));
							geoChart.draw(table);
							form = ui.form(sec);
							ui.textarea(form, 'Anonymous survivors grouped by country', geoCount.join('\n'));
						});
					});


				});
			// TODO get users
			//
			// TODO get ip locations
			//
			// TODO get coodinates of article
			}
			return false;
		});
    });
});
