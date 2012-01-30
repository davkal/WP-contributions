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
// manually added:
/*
{"latitude":-33.859972,"longitude":151.21111,"id":"Australia","region":"Australia"},
{"latitude":12.16,"longitude":-68.23,"id":"Caribbean Netherlands","region":"Caribbean Netherlands"},
{"latitude":-21.350781,"longitude":165.432129,"id":"New Caledonia","region":"New Caledonia"},
{"latitude":78,"longitude":16,"id":"Svalbard and Jan Mayen","region":"Svalbard and Jan Mayen"},
{"latitude":16.75,"longitude":-169.517,"id":"United States Minor Outlying Islands","region":"United States Minor Outlying Islands"},
*/

/* 
 * augmented with official languages
 *
			var p = new Page({title: "List_of_ISO_639-1_codes"});
			p.bind('done', function() {
				window.list1 = {};
				var $l = $(p.attributes.text).siblings('.wikitable');
				_.each($("tr", $l), function(l) {
					var code = $(l).children('td:nth-child(5)').text();
					var link = $('td:nth-child(3) a', l).first().text();
					if(code.length == 2) { 
						list1[link] = code;
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
							_.each(_.keys(list1), function(k) {
								if(candidate.startsWith(k)) {
									list2[country].push(list[k]);
								}
							});
						});
					});
					window.list3 = _.map(list, function(c) {
						delete c.region;
						c.languages = list2[c.id];
						return c;
					});
				});
				p.fetchAdditionalData();
			});
			p.fetchAdditionalData();
 */
// manually added:
/*
 * Australia: en
 * Chile: es
 * Mexico: es
 * Vatican City: it
 * United States: en, es
*/
define({
	list: [
{"latitude":-33.859972,"longitude":151.21111,"id":"Australia","languages":['en']},
{"latitude":12.16,"longitude":-68.23,"id":"Caribbean Netherlands"},
{"latitude":-21.350781,"longitude":165.432129,"id":"New Caledonia"},
{"latitude":78,"longitude":16,"id":"Svalbard and Jan Mayen"},
{"latitude":16.75,"longitude":-169.517,"id":"United States Minor Outlying Islands"},
{"latitude":60.117,"longitude":19.9,"id":"Åland Islands"},
{"latitude":42.5,"longitude":1.517,"id":"Andorra","languages":["ca"]},
{"latitude":-14.3,"longitude":-170.7,"id":"American Samoa"},
{"latitude":34.533,"longitude":69.133,"id":"Afghanistan","languages":["ps","uz","tk"]},
{"latitude":29.5734571,"longitude":2.3730469,"id":"Algeria","languages":["ar"]},
{"latitude":-90,"longitude":0,"id":"Antarctica"},
{"latitude":-8.833,"longitude":13.333,"id":"Angola","languages":["pt"]},
{"latitude":-34.6,"longitude":-58.383,"id":"Argentina","languages":["es","gn"]},
{"latitude":41,"longitude":20,"id":"Albania","languages":["sq"]},
{"latitude":18.22723,"longitude":-63.04899,"id":"Anguilla"},
{"latitude":12.517,"longitude":-70.017,"id":"Aruba"},
{"latitude":40.183,"longitude":44.517,"id":"Armenia","languages":["hy","ru"]},
{"latitude":17.117,"longitude":-61.85,"id":"Antigua and Barbuda","languages":["en"]},
{"latitude":26.0275,"longitude":50.55,"id":"Bahrain","languages":["ar"]},
{"latitude":25.067,"longitude":-77.333,"id":"The Bahamas","languages":["en"]},
{"latitude":48.2,"longitude":16.35,"id":"Austria","languages":["de","hr","sl","cs","hu","sk"]},
{"latitude":13.167,"longitude":-59.55,"id":"Barbados","languages":["en"]},
{"latitude":40.3,"longitude":47.7,"id":"Azerbaijan","languages":["az","hy"]},
{"latitude":53.917,"longitude":27.55,"id":"Belarus","languages":["be","ru"]},
{"latitude":23,"longitude":90,"id":"Bangladesh","languages":["bn"]},
{"latitude":6.467,"longitude":2.6,"id":"Benin","languages":["fr"]},
{"latitude":17.067,"longitude":-88.7,"id":"Belize","languages":["en","es"]},
{"latitude":27.417,"longitude":90.435,"id":"Bhutan","languages":["dz"]},
{"latitude":32.3,"longitude":-64.783,"id":"Bermuda"},
{"latitude":-16.712,"longitude":-64.666,"id":"Bolivia","languages":["es","ay","qu"]},
{"latitude":50.85,"longitude":4.35,"id":"Belgium","languages":["nl","fr","de"]},
{"latitude":-24.667,"longitude":25.917,"id":"Botswana","languages":["en","tn"]},
{"latitude":-6,"longitude":71.5,"id":"British Indian Ocean Territory"},
{"latitude":-54.433,"longitude":3.4,"id":"Bouvet Island"},
{"latitude":43.867,"longitude":18.417,"id":"Bosnia and Herzegovina","languages":["bs","hr","sr"]},
{"latitude":12.333,"longitude":-1.667,"id":"Burkina Faso","languages":["fr","ff"]},
{"latitude":42.683,"longitude":23.317,"id":"Bulgaria","languages":["bg"]},
{"latitude":4.890283,"longitude":114.942217,"id":"Brunei","languages":["ms"]},
{"latitude":-3.5,"longitude":30,"id":"Burundi","languages":["fr","rn"]},
{"latitude":-15.75,"longitude":-47.95,"id":"Brazil","languages":["pt","de"]},
{"latitude":3.867,"longitude":11.517,"id":"Cameroon","languages":["en","fr"]},
{"latitude":11.55,"longitude":104.917,"id":"Cambodia","languages":["km"]},
{"latitude":12.1,"longitude":16.033,"id":"Chad","languages":["ar","fr"]},
{"latitude":4.367,"longitude":18.583,"id":"Central African Republic","languages":["fr","sg"]},
{"latitude":-33.433,"longitude":-70.667,"id":"Chile","languages":["es"]},
{"latitude":45.4,"longitude":-75.667,"id":"Canada","languages":["en","fr","cr","iu"]},
{"latitude":-10.483,"longitude":105.633,"id":"Christmas Island"},
{"latitude":-12.117,"longitude":96.9,"id":"Cocos (Keeling) Islands"},
{"latitude":19.333,"longitude":-81.4,"id":"Cayman Islands"},
{"latitude":35,"longitude":103,"id":"China","languages":["zh","kk","ko","mn","ii","ru","tt","uz","vi","za"]},
{"latitude":-11.683,"longitude":43.267,"id":"Comoros","languages":["ar","fr"]},
{"latitude":-1.44,"longitude":15.556,"id":"Republic of the Congo","languages":["fr","ln"]},
{"latitude":4.65,"longitude":-74.05,"id":"Colombia","languages":["es"]},
{"latitude":9.933,"longitude":-84.083,"id":"Costa Rica","languages":["es"]},
{"latitude":15.11111,"longitude":-23.6166667,"id":"Cape Verde","languages":["pt"]},
{"latitude":6.85,"longitude":-5.3,"id":"Côte d'Ivoire","languages":["fr"]},
{"latitude":-21.2,"longitude":-159.767,"id":"Cook Islands"},
{"latitude":22,"longitude":-79.5,"id":"Cuba","languages":["es"]},
{"latitude":12.183,"longitude":-69,"id":"Curaçao"},
{"latitude":45.8,"longitude":16,"id":"Croatia","languages":["hr"]},
{"latitude":56,"longitude":10,"id":"Denmark","languages":["da","fo","de","kl"]},
{"latitude":-2.88,"longitude":23.656,"id":"Democratic Republic of the Congo","languages":["fr","ln","sw"]},
{"latitude":15.3,"longitude":-61.383,"id":"Dominica","languages":["en"]},
{"latitude":49.75,"longitude":15.75,"id":"Czech Republic","languages":["cs","sk","bg","hr","de","el","hu","pl","ru","sr","uk"]},
{"latitude":11.6,"longitude":43.167,"id":"Djibouti","languages":["ar","fr"]},
{"latitude":13.667,"longitude":-89.167,"id":"El Salvador","languages":["es"]},
{"latitude":-0.15,"longitude":-78.35,"id":"Ecuador","languages":["es"]},
{"latitude":35,"longitude":33,"id":"Cyprus","languages":["el","tr","hy"]},
{"latitude":1.5,"longitude":10,"id":"Equatorial Guinea","languages":["es","fr"]},
{"latitude":19,"longitude":-70.667,"id":"Dominican Republic","languages":["es"]},
{"latitude":15.333,"longitude":38.917,"id":"Eritrea","languages":["ar","ti"]},
{"latitude":9.03,"longitude":38.74,"id":"Ethiopia","languages":["am"]},
{"latitude":-18,"longitude":179,"id":"Fiji","languages":["en","fj"]},
{"latitude":-51.683,"longitude":-59.167,"id":"Falkland Islands"},
{"latitude":59,"longitude":26,"id":"Estonia","languages":["et","ru"]},
{"latitude":62,"longitude":-6.783,"id":"Faroe Islands"},
{"latitude":65,"longitude":27,"id":"Finland","languages":["fi","sv"]},
{"latitude":-17.533,"longitude":-149.567,"id":"French Polynesia"},
{"latitude":47,"longitude":2,"id":"France","languages":["fr","co","br","ty"]},
{"latitude":0.383,"longitude":9.45,"id":"Gabon","languages":["fr"]},
{"latitude":-49.25,"longitude":69.167,"id":"French Southern and Antarctic Lands"},
{"latitude":13.467,"longitude":-16.6,"id":"The Gambia","languages":["en"]},
{"latitude":41.717,"longitude":44.783,"id":"Georgia"},
{"latitude":4,"longitude":-53,"id":"French Guiana"},
{"latitude":52.517,"longitude":13.383,"id":"Germany","languages":["de","da"]},
{"latitude":5.55,"longitude":-0.25,"id":"Ghana","languages":["en","ee","tw"]},
{"latitude":12.05,"longitude":-61.75,"id":"Grenada","languages":["en"]},
{"latitude":36.143,"longitude":-5.353,"id":"Gibraltar"},
{"latitude":39,"longitude":22,"id":"Greece","languages":["el"]},
{"latitude":16.25,"longitude":-61.583,"id":"Guadeloupe"},
{"latitude":13.44444,"longitude":144.73667,"id":"Guam"},
{"latitude":14.633,"longitude":-90.5,"id":"Guatemala","languages":["es"]},
{"latitude":49.45,"longitude":-2.55,"id":"Guernsey"},
{"latitude":72,"longitude":-40,"id":"Greenland"},
{"latitude":9.517,"longitude":-13.7,"id":"Guinea","languages":["fr","ff"]},
{"latitude":12,"longitude":-15,"id":"Guinea-Bissau","languages":["pt"]},
{"latitude":30.033,"longitude":31.217,"id":"Egypt","languages":["ar"]},
{"latitude":6.767,"longitude":-58.167,"id":"Guyana","languages":["en"]},
{"latitude":-53,"longitude":73.5,"id":"Heard Island and McDonald Islands"},
{"latitude":14.1,"longitude":-87.217,"id":"Honduras","languages":["es","en"]},
{"latitude":41.904,"longitude":12.453,"id":"Vatican City","languages":["it"]},
{"latitude":18.533,"longitude":-72.333,"id":"Haiti","languages":["fr","ht"]},
{"latitude":22.27833,"longitude":114.15889,"id":"Hong Kong","languages":["zh","en"]},
{"latitude":47.433,"longitude":19.25,"id":"Hungary","languages":["hu","hr","de","ro","sr","sk"]},
{"latitude":-6.175,"longitude":106.8283,"id":"Indonesia","languages":["id","jv","ms","su"]},
{"latitude":33.333,"longitude":44.433,"id":"Iraq","languages":["ar","ku"]},
{"latitude":32,"longitude":53,"id":"Iran","languages":["fa","ku","ar"]},
{"latitude":21,"longitude":78,"id":"India","languages":["en","hi","as","bn","fr","gu","kn","ks","ms","ml","ne","or","sd","ta","te","ur"]},
{"latitude":54.25,"longitude":-4.5,"id":"Isle of Man"},
{"latitude":65,"longitude":-18,"id":"Iceland","languages":["is","is"]},
{"latitude":41.9,"longitude":12.483,"id":"Italy","languages":["it","sq","ca","hr","fr","de","el","sc","sl"]},
{"latitude":35.683,"longitude":139.767,"id":"Japan","languages":["ja"]},
{"latitude":49.19,"longitude":-2.11,"id":"Jersey"},
{"latitude":31,"longitude":35,"id":"Israel","languages":["he","ar"]},
{"latitude":18.1823878,"longitude":-77.3217773,"id":"Jamaica","languages":["en"]},
{"latitude":53.34417,"longitude":-6.2675,"id":"Republic of Ireland","languages":["en","ga"]},
{"latitude":1.467,"longitude":173.033,"id":"Kiribati","languages":["en"]},
{"latitude":48,"longitude":68,"id":"Kazakhstan","languages":["kk","ru"]},
{"latitude":-1.267,"longitude":36.8,"id":"Kenya","languages":["en","sw"]},
{"latitude":31.95,"longitude":35.933,"id":"Jordan","languages":["ar"]},
{"latitude":29.367,"longitude":47.967,"id":"Kuwait","languages":["ar"]},
{"latitude":42.867,"longitude":74.6,"id":"Kyrgyzstan","languages":["ru"]},
{"latitude":57,"longitude":25,"id":"Latvia","languages":["lv"]},
{"latitude":17.967,"longitude":102.6,"id":"Laos","languages":["lo"]},
{"latitude":40,"longitude":127,"id":"North Korea","languages":["ko"]},
{"latitude":6.317,"longitude":-10.8,"id":"Liberia","languages":["en"]},
{"latitude":-29.467,"longitude":27.933,"id":"Lesotho","languages":["en"]},
{"latitude":33.9,"longitude":35.533,"id":"Lebanon","languages":["ar","fr","hy"]},
{"latitude":54.683,"longitude":25.317,"id":"Lithuania","languages":["lt"]},
{"latitude":37.583,"longitude":127,"id":"South Korea","languages":["ko"]},
{"latitude":47.1417,"longitude":9.5233,"id":"Liechtenstein","languages":["de"]},
{"latitude":27.4,"longitude":17.6,"id":"Libya","languages":["ar"]},
{"latitude":22.167,"longitude":113.55,"id":"Macau","languages":["pt"]},
{"latitude":49.6,"longitude":6.117,"id":"Luxembourg","languages":["fr","de","lb"]},
{"latitude":41.6,"longitude":21.7,"id":"Republic of Macedonia","languages":["mk"]},
{"latitude":-20,"longitude":47,"id":"Madagascar","languages":["fr","mg"]},
{"latitude":-13.95,"longitude":33.7,"id":"Malawi","languages":["ny","en"]},
{"latitude":12.65,"longitude":-8,"id":"Mali","languages":["fr"]},
{"latitude":3.133,"longitude":101.7,"id":"Malaysia","languages":["ms","en"]},
{"latitude":14.667,"longitude":-61,"id":"Martinique"},
{"latitude":35.883,"longitude":14.5,"id":"Malta","languages":["mt","en"]},
{"latitude":-20.2,"longitude":57.5,"id":"Mauritius","languages":["en"]},
{"latitude":18.15,"longitude":-15.967,"id":"Mauritania","languages":["ar","fr","ff","wo"]},
{"latitude":-12.84306,"longitude":45.13833,"id":"Mayotte"},
{"latitude":6.917,"longitude":158.183,"id":"Federated States of Micronesia","languages":["en"]},
{"latitude":19.05,"longitude":-99.367,"id":"Mexico","languages":["es"]},
{"latitude":47,"longitude":28.917,"id":"Moldova","languages":["ro","ru","uk"]},
{"latitude":3.2,"longitude":73.22,"id":"Maldives","languages":["dv"]},
{"latitude":7.067,"longitude":171.267,"id":"Marshall Islands","languages":["en","mh"]},
{"latitude":43.73278,"longitude":7.41972,"id":"Monaco","languages":["fr"]},
{"latitude":46,"longitude":105,"id":"Mongolia","languages":["mn"]},
{"latitude":42.783,"longitude":19.467,"id":"Montenegro","languages":["sq","bs","hr","sr"]},
{"latitude":16.75,"longitude":-62.2,"id":"Montserrat"},
{"latitude":-22.57,"longitude":17.086117,"id":"Namibia","languages":["en","af","de"]},
{"latitude":34.033,"longitude":-6.85,"id":"Morocco","languages":["ar"]},
{"latitude":-0.527288,"longitude":166.936724,"id":"Nauru","languages":["en","na"]},
{"latitude":26.533,"longitude":86.733,"id":"Nepal","languages":["ne"]},
{"latitude":52.317,"longitude":5.55,"id":"Netherlands","languages":["nl","li","en"]},
{"latitude":-25.95,"longitude":32.583,"id":"Mozambique","languages":["pt"]},
{"latitude":22,"longitude":96,"id":"Myanmar","languages":["my"]},
{"latitude":-19.05,"longitude":-169.917,"id":"Niue"},
{"latitude":13.533,"longitude":2.083,"id":"Niger","languages":["fr","ha","kr"]},
{"latitude":17,"longitude":146,"id":"Northern Mariana Islands"},
{"latitude":8,"longitude":10,"id":"Nigeria","languages":["en","ha","yo","ig"]},
{"latitude":-29.033333,"longitude":167.95,"id":"Norfolk Island"},
{"latitude":59.933,"longitude":10.683,"id":"Norway","languages":["no"]},
{"latitude":23.6,"longitude":58.55,"id":"Oman","languages":["ar"]},
{"latitude":7.35,"longitude":134.467,"id":"Palau","languages":["en","ja"]},
{"latitude":31.883,"longitude":35.2,"id":"Palestinian territories"},
{"latitude":8.967,"longitude":-79.533,"id":"Panama","languages":["es"]},
{"latitude":33.667,"longitude":73.167,"id":"Pakistan","languages":["ur","en","ps","sd"]},
{"latitude":-9.5,"longitude":147.117,"id":"Papua New Guinea","languages":["en","ho"]},
{"latitude":-25.267,"longitude":-57.667,"id":"Paraguay","languages":["es","gn"]},
{"latitude":-12.0433,"longitude":-77.0283,"id":"Peru","languages":["es","ay","qu"]},
{"latitude":-25.067,"longitude":-130.1,"id":"Pitcairn Islands"},
{"latitude":52.217,"longitude":21.033,"id":"Poland","languages":["pl","de","lt"]},
{"latitude":14.583,"longitude":121,"id":"Philippines","languages":["ar","en","es","tl"]},
{"latitude":25.3,"longitude":51.517,"id":"Qatar","languages":["ar"]},
{"latitude":-21.11444,"longitude":55.5325,"id":"Réunion"},
{"latitude":38.7,"longitude":-9.183,"id":"Portugal","languages":["pt"]},
{"latitude":-42,"longitude":174,"id":"New Zealand","languages":["en","sm"]},
{"latitude":18.45,"longitude":-66.1,"id":"Puerto Rico"},
{"latitude":13,"longitude":-85,"id":"Nicaragua","languages":["es"]},
{"latitude":-15.933,"longitude":-5.717,"id":"Saint Helena, Ascension and Tristan da Cunha"},
{"latitude":17.9,"longitude":-62.833,"id":"Saint Barthélemy"},
{"latitude":-1.943883,"longitude":30.05945,"id":"Rwanda","languages":["en","fr","rw"]},
{"latitude":18.07528,"longitude":-63.06,"id":"Collectivity of Saint Martin"},
{"latitude":55.75,"longitude":37.617,"id":"Russia","languages":["ru","az","ba","ce","cv","kv","tt"]},
{"latitude":14.017,"longitude":-60.983,"id":"Saint Lucia","languages":["en"]},
{"latitude":13.167,"longitude":-61.233,"id":"Saint Vincent and the Grenadines","languages":["en"]},
{"latitude":46.783,"longitude":-56.2,"id":"Saint Pierre and Miquelon"},
{"latitude":44.417,"longitude":26.1,"id":"Romania","languages":["ro","hy","de","hu","sr","sk","tr","uk"]},
{"latitude":-13.833,"longitude":-171.75,"id":"Samoa","languages":["en","sm"]},
{"latitude":0.333,"longitude":6.733,"id":"São Tomé and Príncipe","languages":["pt"]},
{"latitude":17.3,"longitude":-62.733,"id":"Saint Kitts and Nevis","languages":["en"]},
{"latitude":43.933,"longitude":12.467,"id":"San Marino","languages":["it"]},
{"latitude":-4.617,"longitude":55.45,"id":"Seychelles","languages":["en","fr"]},
{"latitude":14.667,"longitude":-17.417,"id":"Senegal","languages":["fr","wo"]},
{"latitude":24.65,"longitude":46.767,"id":"Saudi Arabia","languages":["ar"]},
{"latitude":18.017,"longitude":-63.05,"id":"Sint Maarten"},
{"latitude":44.8,"longitude":20.467,"id":"Serbia","languages":["sr","sq","hr","hu","ro","sk"]},
{"latitude":48.15,"longitude":17.117,"id":"Slovakia","languages":["sk"]},
{"latitude":-9.467,"longitude":159.817,"id":"Solomon Islands","languages":["en"]},
{"latitude":46.05,"longitude":14.5,"id":"Slovenia","languages":["sl","hu","it","hr"]},
{"latitude":1.3,"longitude":103.8,"id":"Singapore","languages":["en","ms","zh","ta"]},
{"latitude":8.48445,"longitude":-13.23445,"id":"Sierra Leone","languages":["en"]},
{"latitude":4.85,"longitude":31.6,"id":"South Sudan"},
{"latitude":2.033,"longitude":45.35,"id":"Somalia","languages":["so","ar"]},
{"latitude":-30,"longitude":25,"id":"South Africa","languages":["af","en","ts","tn","ve","xh","zu"]},
{"latitude":5.833,"longitude":-55.167,"id":"Suriname","languages":["nl"]},
{"latitude":40.433,"longitude":-3.7,"id":"Spain","languages":["es","ca","gl","eu","oc"]},
{"latitude":15,"longitude":32,"id":"Sudan","languages":["ar","en"]},
{"latitude":-54.25,"longitude":-36.75,"id":"South Georgia and the South Sandwich Islands"},
{"latitude":-26.317,"longitude":31.133,"id":"Swaziland","languages":["en"]},
{"latitude":33.5,"longitude":36.3,"id":"Syria","languages":["ar"]},
{"latitude":38.55,"longitude":68.8,"id":"Tajikistan","languages":["tg","ru"]},
{"latitude":46.8333333,"longitude":8.3333333,"id":"Switzerland","languages":["de","fr","it","rm"]},
{"latitude":7,"longitude":81,"id":"Sri Lanka","languages":["si","ta"]},
{"latitude":-6.307,"longitude":34.854,"id":"Tanzania","languages":["sw","en"]},
{"latitude":23.767,"longitude":121,"id":"Taiwan"},
{"latitude":59.35,"longitude":18.067,"id":"Sweden","languages":["sv","fi","yi","sv"]},
{"latitude":6.117,"longitude":1.217,"id":"Togo","languages":["fr"]},
{"latitude":13.75,"longitude":100.483,"id":"Thailand","languages":["th"]},
{"latitude":-9.167,"longitude":-171.833,"id":"Tokelau"},
{"latitude":-21.133,"longitude":-175.2,"id":"Tonga","languages":["en","to"]},
{"latitude":10.667,"longitude":-61.517,"id":"Trinidad and Tobago","languages":["en"]},
{"latitude":36.833,"longitude":10.15,"id":"Tunisia","languages":["ar","fr"]},
{"latitude":37.967,"longitude":58.333,"id":"Turkmenistan","languages":["tk","ru"]},
{"latitude":-8.567,"longitude":125.567,"id":"East Timor","languages":["pt","id"]},
{"latitude":21.505,"longitude":-71.754,"id":"Turks and Caicos Islands"},
{"latitude":-8.517,"longitude":179.217,"id":"Tuvalu","languages":["en"]},
{"latitude":39.917,"longitude":32.833,"id":"Turkey","languages":["tr"]},
{"latitude":1.28,"longitude":32.39,"id":"Uganda","languages":["en","sw"]},
{"latitude":49,"longitude":32,"id":"Ukraine","languages":["uk","ru"]},
{"latitude":-34.883,"longitude":-56.167,"id":"Uruguay","languages":["es"]},
{"latitude":24.467,"longitude":54.367,"id":"United Arab Emirates","languages":["ar"]},
{"latitude":41.267,"longitude":69.217,"id":"Uzbekistan","languages":["uz","ru"]},
{"latitude":51.5,"longitude":-0.117,"id":"United Kingdom","languages":["en"]},
{"latitude":-17.75,"longitude":168.3,"id":"Vanuatu","languages":["bi","en","fr"]},
{"latitude":38.883,"longitude":-77.017,"id":"United States","languages":["en, es"]},
{"latitude":18.431383,"longitude":-64.62305,"id":"British Virgin Islands"},
{"latitude":18.35,"longitude":-64.933,"id":"United States Virgin Islands"},
{"latitude":10.5,"longitude":-66.967,"id":"Venezuela","languages":["es"]},
{"latitude":21.033,"longitude":105.85,"id":"Vietnam","languages":["vi"]},
{"latitude":-13.3,"longitude":-176.2,"id":"Wallis and Futuna"},
{"latitude":25,"longitude":-13,"id":"Western Sahara"},
{"latitude":-15.417,"longitude":28.283,"id":"Zambia","languages":["en"]},
{"latitude":15.35,"longitude":44.2,"id":"Yemen","languages":["ar"]},
{"latitude":-17.833,"longitude":31.05,"id":"Zimbabwe","languages":["en","sn"]}
]});
