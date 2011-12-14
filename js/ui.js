define(["jquery"], function($) {
	var container = $('.content');
	var status = $('#status');
	var nav = $('.topbar ul.nav');

	return {
		div: function(ct, id) {
			ct.append('<div id="{0}" />'.format(id));
			return $('#'+id);
		},
		clear: function() {
			$('.row').remove();
			$('.topbar a[href!="#"]').remove();
		},
		display: function(form, label, value) {
			form.append('<div class="clearfix"><label>' + label + '</label><div class="input">' + value + '</div></div>');
		},
		form: function(ct) {
			ct.append("<form />");
			return $(ct).children().last();
		},
		status: function(msg) {
			status.text(msg || "Ready.");
		},
		section: function(title, id) {
			id = id || title.toLowerCase();
			container.append('<div class="row"><div id="' + id + '" class="span12"><h2>' + title + '</h2></div></div>');

			nav.append('<li><a href="#' + id +'">' + title + '</a></li>');
			return $('.row div').last();
		}, 
		textarea: function(form, label, value) {
			form.append('<div class="clearfix"><label>' + label + '</label><div class="input"><textarea class="xxlarge" rows="6">' + value + '</textarea></div></div>');
		}
	}
});
