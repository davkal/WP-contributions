String.prototype.endsWith = function (suffix) {
	  return (this.substr(this.length - suffix.length) === suffix);
}

String.prototype.startsWith = function(prefix) {
	  return (this.substr(0, prefix.length) === prefix);
}

String.prototype.toTitleCase = function () {
	var A = this.split(' '), B = [];
	for (var i = 0; A[i] !== undefined; i++) {
		B[B.length] = A[i].substr(0, 1).toUpperCase() + A[i].substr(1);
	}
	return B.join(' ');
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
		"app"
	], function($, _, Backbone, ba, bs, app) {

		window._ = _;

		_.mixin({
			avg: function(list) {
				return _.sum(list) / _.size(list);
			},
			has: function(list, property) {
				return _.filter(list, function(i){return i.has(property)});
			}, 
			random: function(list) {
				if(list.length) {
					var index = Math.floor(Math.random() * list.length);
					return list[index];
				}
			},
			sum: function(list, iterator) {
				return _.reduce(list, function(memo, num){ 
					num = iterator ? iterator(num) : num;
					return memo + num;
				}, 0);
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
				$(this).parents('.add-on').addClass('active');
			} else {
				$(this).parents('.add-on').removeClass('active');
			}
		})
});
