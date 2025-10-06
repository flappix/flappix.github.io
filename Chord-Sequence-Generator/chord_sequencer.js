function ChordSequencer() {
	let minor = {
		'c': 0, // bbb
		'c#': 1, // ####
		'd': 0, // b
		'd#': 1, // ######
		'e': 1, // #
		'f': 0, // bbbb
		'f#': 1, // ###
		'g': 0, // bb
		'g#': 1, // ##### 
		'a': 1,
		'b♭': 0, // bbbbb
		'b': 1, // ##
	};
	
	return {
		notes: ['a', ['b♭', 'a#'], ['c♭', 'b'], 'c', ['d♭', 'c#'], 'd', ['e♭', 'd#'], 'e', 'f', ['g♭', 'f#'], 'g', ['a♭', 'g#']],
		
		// 0 for b-keys, 1 for #-keys
		chord_map: {
			'major': {
				'c': 1,
				'c#': 1, // #######
				'd': 1, // ##
				'e♭': 0, // bbb 
				'e': 1, // ####
				'f': 0, // b
				'f#': 1, // ######
				'g': 0, // #,
				'a♭': 0, // bbbb 
				'a': 1, // ###
				'b♭': 0, // bb
				'b': 1, // #####
			},
			'natural minor': minor,
			'harmonic minor': minor
		},
		chord_scale: {
			'major': [
				'',				// I major
				null,
				'm',
				null,			// II minor
				'm',			// III minor
				'',				// IV major
				null,
				'',				// V major
				null,
				'm',			// VI minor
				null,
				'dim'			// VII diminished
			],
			'natural minor': [
				'm',			// I minor
				null,
				'dim',			// II dim	
				'',			// III major
				null,
				'm',			// IV minor
				null,
				'm',			// V minor,
				'',				// VI major
				null,
				'',				// VII major
				null
			],
			'harmonic minor': [
				'm',			// I minor
				null,
				'dim',			// II dim	
				'',			// III major
				null,
				'm',			// IV minor
				null,
				'',			// V major
				'',				// VI major
				null,
				'',				// VII major
				null
			]
		},
		// keys: intervals
		// nvalue: umber of half-tone-steps for interval. First values are prioritized
		interval_map: {
			0: [0],			// unison
			1: [2, 1],		// major second, minor-second
			2: [3, 4],		// minor-third, major third
			3: [5, 6],		// perfect-fourth, auguemnted-fourth
			4: [7, 6, 8],	// perfect-fifth, diminished-fifth, augumented-fifth
			5: [8, 9],		// minor-sixth, major-sixth
			6: [10, 11]		// minor-seventh, major-seventh
		},
		
		chord_sequence: function (
			root_note, // one of the notes in the notes-array
			mode, // 'major' or 'natural minor', 'harmonic minor'
			interval_sequence, // array of intervals
			start=0,
			max_chords=null
		) {
			let is_note=0;
			for (let i in this.chord_scale[mode]) {
				if (this.chord_scale[mode][i] != null) {
					if (start == is_note) {
						start = Number (i);
						break;
					}
					else {
						is_note++;
					}
				}
				
				console.log ('is_note', is_note);
				
			}
			
			console.log ('start', start, this.chord_scale[mode], this.chord_scale[mode][start]);
			
			let root_note_pointer = ( this.notes.findIndex ( i => !Array.isArray (i) ? i == root_note : i.includes (root_note) ) + start ) % this.notes.length;
			
			let result = [`${this.getNote (root_note_pointer, mode, root_note)}${this.chord_scale[mode][start]}`];
			
			let chord_scale_pointer = start;
			let remember = [`0_${chord_scale_pointer}`];
			let repeated = false;
			
			let interval_sequence_pointer = 0;
			
			while ( max_chords != null ? result.length < max_chords : !repeated) {
				let curr_interval = interval_sequence[interval_sequence_pointer];
				let l = Object.values (this.interval_map).length;
				if (curr_interval > 0) {
					curr_interval = (curr_interval - 1) % l;
				}
				
				if (curr_interval < 0) {
					curr_interval = ( (l + 1) + (curr_interval % l) ) % l; // build inverted interval
				}
				
				let half_tone_offset = this.interval_map[curr_interval].find (i => this.chord_scale[mode][(chord_scale_pointer + i) % this.chord_scale[mode].length] != null);
				
				chord_scale_pointer = (chord_scale_pointer + half_tone_offset) % this.chord_scale[mode].length;
				root_note_pointer = (root_note_pointer + half_tone_offset) % this.notes.length;
				
				let note = this.getNote (root_note_pointer, mode, root_note);
				
				//console.log ('half_tone_offset', half_tone_offset);
				//console.log ('root_note_pointer', root_note_pointer)
				//console.log ('chord_scale_pointer', chord_scale_pointer);
				
				//console.log (`${note}${this.chord_scale[mode][chord_scale_pointer]}`);
				interval_sequence_pointer = (interval_sequence_pointer + 1) % interval_sequence.length;
				//console.log (remember);
				let r = `${interval_sequence_pointer}_${chord_scale_pointer}`;
				if ( !remember.includes (r) || max_chords != null ) {
					remember.push (`${interval_sequence_pointer}_${chord_scale_pointer}`);
					result.push (`${note}${this.chord_scale[mode][chord_scale_pointer]}`);
				}
				else {
					repeated = true;
				}
			}
			
			return result;
		},
		getNote: function (pointer, mode, root_note) {
			console.log ('pointer', pointer, this.notes[pointer]);
			return (!Array.isArray (this.notes[pointer]) ? this.notes[pointer] : this.notes[pointer][this.chord_map[mode][root_note]]).toUpperCase();
		},
		validate_seq: function (seq) {
			return seq.split (',').map ( s => Number (s) ).filter ( s => isNaN (s) ).length == 0;
		}
	};
}
