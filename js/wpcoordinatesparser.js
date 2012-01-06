define(["jquery", "underscore" ], function($, _) {

	var patterns = {
		"(-?[\\d\\.]+);\\s*(-?[\\d\\.]+)": function(match) {
			return [parseFloat(match[1]),
					parseFloat(match[2])]
		},
		"{{coord\\|(\\d+)\\|(\\d+)\\|([\\d\\.]+)\\|([NS])\\|(\\d+)\\|(\\d+)\\|([\\d\\.]+)\\|([EW])\\|": function(match) {
			var ns = match[4] == 'S' ? -1 : 1;
			var ew = match[8] == 'W' ? -1 : 1;
			return [ns * (parseFloat(match[1]) + (parseFloat(match[2]) * 60 + parseFloat(match[3])) / 3600),
					ew * (parseFloat(match[5]) + (parseFloat(match[6]) * 60 + parseFloat(match[7])) / 3600) ]
		},
		"{{coord\\|(\\d+)\\|([\\d\\.]+)\\|([NS])\\|(\\d+)\\|([\\d\\.]+)\\|([EW])\\|": function(match) {
			var ns = match[3] == 'S' ? -1 : 1;
			var ew = match[6] == 'W' ? -1 : 1;
			return [(parseFloat(match[1]) + parseFloat(match[2]) / 60) * ns,
					(parseFloat(match[4]) + parseFloat(match[5]) / 60) * ew ]
		},
		"{{coord\\|([\\d\\.]+)\\|([NS])\\|([\\d\\.]+)\\|([EW])\\|": function(match) {
			var ns = match[2] == 'S' ? -1 : 1;
			var ew = match[4] == 'W' ? -1 : 1;
			return [parseFloat(match[1]) * ns,
					parseFloat(match[3]) * ew ]
		},
		"{{coord\\|(-?[\\d\\.]+)\\|(-?[\\d\\.]+)\\|display": function(match) {
			return [parseFloat(match[1]),
					parseFloat(match[2])]
		},
		"latd=(-?\\d+)\\s*\\|latm=(\\d+)\\s*\\|lats=([\\d\\.]+)\\s*\\|longd=(-?\\d+)\\s*\\|longm=(\\d+)\\s*\\|longs=([\\d\\.]+)": function(match) {
			return [parseFloat(match[1]) + (parseFloat(match[2]) * 60 + parseFloat(match[3])) / 3600,
					parseFloat(match[4]) + (parseFloat(match[5]) * 60 + parseFloat(match[6])) / 3600]
		},
		"latd=(\\d+)\\s*\\|latm=([\\d\\.]+)\\s*\\|latNS=([NS])\\s*\\|longd=(\\d+)\\s*\\|longm=([\\d\\.]+)\\s*\\|longEW=([EW])": function(match) {
			var ns = match[3] == 'S' ? -1 : 1;
			var ew = match[6] == 'W' ? -1 : 1;
			return [ (parseFloat(match[1]) + parseFloat(match[2]) / 60) * ns,
					(parseFloat(match[4]) + parseFloat(match[5]) / 60) * ew ]
		}
	};

	function parse(text) {
		var match, loc;
		_.any(patterns, function(parser, pattern) {
			match = text.match(new RegExp(pattern, "im"));
			if(match && match.length > 1) {
				loc = parser(match);
			}
			return match;
		});
		if(loc) {
			return {
				latitude: loc[0],
				longitude: loc[1]
			};
		} else {
			console.log("No match for geotag.");
		}
	}

	function test(text, lat, long) {
		var parsed = parse(text);
		console.assert(parsed);
		console.assert(Math.abs(parsed.latitude - lat) < 1 && Math.abs(parsed.longitude - long) < 1);
	}

	test("{{Coord|26|01|39|N|50|33|00|E|region:BH_type:country|display=title,inline}}", 26.027, 50.550);

	return {
		test: test,
		parse: parse
	}
});
