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
		"underscore", 
		"backbone", 
		"bootstrap-alerts",
		"bootstrap-scrollspy",
		"jquery.xdomainajax",
		"app"
	], function($, _, Backbone, ba, bs, jx, app) {

		_.mixin({
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
});
