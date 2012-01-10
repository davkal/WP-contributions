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

require.config({
	waitSeconds: 15
});
require.onError = function() {
	$('#status').text('Missing JS libraries.');
}

require(["jquery", 
		"underscore", 
		"backbone", 
		"bootstrap-alerts",
		"bootstrap-scrollspy",
		"jquery.xdomainajax",
		"app"
	], function($, _, Backbone, ba, bs, jx, app) {

		window._ = _;

		_.mixin({
			random: function(list) {
				if(list.length) {
					var index = Math.floor(Math.random() * list.length);
					return list[index];
				}
			},
			sum: function(list) {
				return _.reduce(list, function(memo, num){ return memo + num }, 0);
			},
			extract: function(obj, list) {
				var ret = {};
				_.each(obj, function(val, key) {
					if(_.include(list, key)) {
						ret[key] = val;
					}
				});
				return ret;
			}
		});

		app.init();
		$('.topbar').scrollSpy();

		$('.add-on :checkbox').change(function () {
			if ($(this).attr('checked')) {
				$(this).parents('.add-on').addClass('active')
					.next().attr('placeholder', "Template");
			} else {
				$(this).parents('.add-on').removeClass('active')
					.next().attr('placeholder', "Article");
			}
		})
});
