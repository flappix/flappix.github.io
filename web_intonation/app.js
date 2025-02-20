// functional filter method for objects
function filterObj (obj, func) {
	return Object.fromEntries ( Object.entries (obj).filter (func) );
}

function mod(n, m) {
	return ((n % m) + m) % m;
}
	  
function ScaleApp()
{
	const octave_multi = 8;
	
	return {
		init: function()
		{
			this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			
			this.curr_notes = this.createFromTemplate (this.curr_tuning, this.curr_scale);
			this.pureIntervals = this.tunings.just_intonation.notes.map (n => math.simplify (n).toString() );
			
			this.initPlot();
			
			this.midi.scaleNotes = 'C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B'.split (',').map ( x => x.trim() );
		},
		initPlot: function()
		{
			let x = Array.from(Array(100).keys()).map (x => x / Math.PI);
			Plotly.newPlot ('graph', [{
			  x: x,
			  y: x.map ( x => Math.sin (x * 2) ),
			  line: {
				  shape: 'spline',
				  color: this.colors[0],
			  },
			  type: 'scatter',
			  name: '1'.padStart (5, ' ')
			}],
			{
				xaxis: {
					showticklabels: false,
					range: [0, Math.PI * this.graph_periods],
					title: { text: 'time' },
					automargin: false,
				},
				yaxis: {
					showticklabels: false,
					title: { text: 'amplitude', standoff: 40},
					standoff: 40,
				},
				 margin: {
					l: 40,
					r: 0,
					b: 0,
					t: 10,
					pad: 0
				},
				legend: {
					font: {
					  family: 'Courier New, monospace',
					},
				},
				showlegend: true,
				hovermode: false,
			});
		},
		updatePeriods: function () {
			for (let d=0; d < this.graph_show_degrees.length; d++) {
				let degree = this.graph_show_degrees[d];
				const [degree_adj, octave] = this.getOctave (degree);
				this.deletePlotTrace (0);
				this.addPlotTrace (degree_adj, octave);
			}
			
			Plotly.relayout ('graph', {
				xaxis: {
					showticklabels: false,
					range: [0, Math.PI * this.graph_periods]
				}
			});
		},
		
		oscillatorStore: [],
		oscillators: {},
		playing: [], // currently active notes
		volume: 0.01,
		marker: null, // index of scale degree to highlight
		//curr_notes: Alpine.$persist([]),
		curr_notes: [],
		curr_ratios: [],
		graph_show_degrees: [0],
		graph_periods: 1,
		colors: ['rgba(141, 211, 199, 1)',
				 'rgba(190, 186, 218, 1)',
				 'rgba(251, 128, 114, 1)',
				 'rgba(128, 177, 211, 1)',
				 'rgba(253, 180, 98, 1)',
				 'rgba(179, 222, 105, 1)',
				 'rgba(252, 205, 229, 1)',
				 'rgba(217, 217, 217, 1)',
				 'rgba(188, 128, 189, 1)',
				 'rgba(204, 235, 197, 1)',
				 'rgba(255, 237, 111, 1)',
				 '#8E8E00'],
		filter: ['scale', 'keyboard', 'graph', /*'inter_scale_ratios'*/],
		dropdown: {
			show: null,
			tuning: 'just_intonation',
			scale: 'major',
			degree: 0,
		},
		tab: 'tuning', // or 'synth', 'midi'
		harmonics: 0,
		reduction: 0.5,
		
		createOscillator: function() {
			let oscillator = this.audioCtx.createOscillator();
			oscillator.type = 'sine';
			
			let envelope = this.audioCtx.createGain();
			envelope.connect (this.audioCtx.destination);
			oscillator.connect (envelope);
			oscillator.envelope = envelope;
			envelope.gain.setValueAtTime(0, 0);
			//envelope.starttime = this.audioCtx.currentTime + 0.3;
			envelope.starttime = this.audioCtx.currentTime + 0;
			envelope.gain.linearRampToValueAtTime (this.volume, envelope.starttime);
						
			oscillator.harmonics = [];
			let volume = this.volume;
			// add harmonics
			for (let h=0; h<this.harmonics; h++)
			{
				let harmonic = this.audioCtx.createOscillator();
				harmonic.type = 'sine';
				
				let envelope = this.audioCtx.createGain();
				envelope.connect (this.audioCtx.destination);
				harmonic.connect (envelope);
				harmonic.envelope = envelope;
				envelope.gain.setValueAtTime(0, 0);
				envelope.starttime = this.audioCtx.currentTime + 0.3;
				
				volume *= this.reduction;
				envelope.gain.linearRampToValueAtTime (volume, envelope.starttime);
				
				oscillator.harmonics.push (harmonic);	
			}
			
			oscillator.setFreq = (freq) => {
				oscillator.frequency.value = freq;
				for (let h=0; h < this.harmonics; h++)
				{
					oscillator.harmonics[h].frequency.value = freq * (  (h + 2) );
				}
			};
			
			oscillator.startAll = function() {
				this.start();
				for (let h of this.harmonics)
				{
					h.start();
				}
			};
			
			oscillator.stopAll = () => {
				let osc = oscillator;
				osc.envelope.gain.cancelScheduledValues (osc.envelope.starttime);
				osc.envelope.gain.linearRampToValueAtTime (0, this.audioCtx.currentTime + 0.5);
				for (let h of osc.harmonics)
				{
					h.envelope.gain.cancelScheduledValues (h.envelope.starttime);
					h.envelope.gain.linearRampToValueAtTime (0, this.audioCtx.currentTime + 0.5);
				}
				
				setTimeout ( () => {
					osc.envelope.gain.setValueAtTime (0, this.audioCtx.currentTime);
					osc.envelope.disconnect (this.audioCtx.destination);
					osc.stop();
					for (let h of osc.harmonics)
					{
						h.envelope.disconnect (this.audioCtx.destination);
						h.stop();
					}
					
				}, 500);
			};
			
			
			return oscillator;
		},
		
		getOctave: function (degree) {
			let len = Object.values (this.curr_notes).length;
			// transform octaves
			let degree_adj = mod (degree,  len);
			let octave = Math.floor (degree / len);
			return [degree_adj, octave];
		},
		
		playNote: function (degree)
		{
			degree = Number (degree);
			
			if ( ! (degree in this.oscillators) )
			{
				this.oscillators[degree] = this.createOscillator();
				
				// transform octaves
				const [degree_adj, octave] = this.getOctave (degree);
				
				// evaluate math expr to frequency
				let freq = this.getFreq (degree_adj);
				if (freq)
				{
					this.oscillators[degree].setFreq ( (this.root.freq * freq) * (2 ** octave) );
					this.oscillators[degree].startAll();
					this.playing.push (degree);
					
					if ( this.filter.includes ('graph') && ! this.graph_show_degrees.includes (degree) ) {
						this.addPlotTrace (degree_adj, octave);
					}
				}
			}
		},
		
		stopNote: function (degree)
		{
			degree = Number (degree);
			
			if (degree in this.oscillators)
			{
				let osc = this.oscillators[degree];
				osc.stopAll();
				delete this.oscillators[degree];
				
				
				this.playing = this.playing.filter (d => d != degree);
				
				if ( ! this.graph_show_degrees.includes (degree) )
				{
					this.deletePlotTrace ( this.playing.indexOf (degree) );
				}
			}
		},
		
		getFreq: function (degree)
		{						
			try
			{
				return math.evaluate ( String (this.curr_notes[degree]) );
			}
			catch (e)
			{
				return null;
			}
		},
		formatFreq: function (freq) {
			return parseFloat ( String (this.root.freq * this.getFreq (freq) ) ).toFixed(2);
		},
		
		stopAll: function()
		{
			for (let osc in this.oscillators)
			{
				this.stopNote (osc);
			}
		},
		
		isPure: function (degree) {
			try
			{
				return this.pureIntervals.filter ( (pi) => {
					let r  = math.evaluate (`( ${this.curr_notes[degree] ?? ''} ) / ( ${pi} )` );
					return r == Math.floor (r);
				}).length > 0;
			}
			catch (err) {
				return '';
			}
		},
		
		root: {
			freq: 55 * octave_multi,
			note: 'A'
		},
		curr_tuning: 'just_intonation',
		tunings: {					
			just_intonation: {
				type: 'relative',
				scalable: true, // a scale can be applied
				notes: ['1', '1 + 1/15', '1 + 1/8', '1 + 1/5', '1 + 1/4', '1 + 1/3', '1 + 13/32', '1 + 1/2', '1 + 3/5', '1 + 2/3', '1 + 4/5',  '1 + 7/8']
			},
			
			equal_temperament: {
				type: 'relative',
				scalable: true, // a scale can be applied
				notes: ['1', '2^(1/12)', '2^(2/12)',  '2^(3/12)',  '2^(4/12)', '2^(5/12)',  '2^(6/12)',  '2^(7/12)',  '2^(8/12)',  '2^(9/12)', '2^(10/12)',  '2^(11/12)']
			},
			
			pythagorean_tuning: {
				type: 'relative',
				scalable: true, // a scale can be applied
				notes: ['1', '2^8 / 3^5', '3^2 / 2^3',  '2^5 / 3^3',  '3^4 / 2^6', '2^2 / 3',  '2^10 / 3^6',  /*'3^6 / 2^9', */ '3 / 2',  '2^7 / 3^4', '3^3 / 2^4',  '2^4 / 3^2', '3^5 / 2^7']
			},
			
			meantone_temperament: {
				type: 'relative',
				scalable: true, // a scale can be applied
				notes: ['1', '5/16 * nthRoot(5^3, 4)', '1/2 * sqrt(5)', '4/5 * nthRoot(5,4)', '1 + 1/4', '2/5 * nthRoot(5^3,4)', '5/8 * sqrt(5)', 'nthRoot(5,4)', '25/16', '1/2 * nthRoot(5^3,4)', '4/5 * sqrt(5)', '5/4 * nthRoot(5,4)']
			},
			
			
			harmonic_series: {
				type: 'relative',
				notes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
			},
			
			custom_equal_scale: {
				type: 'relative',
				notes: ['1', '1 + 1/7', '1 + 2/7', '1 + 3/7', '1 + 4/7', '1 + 5/7', '1 + 6/7']
			},
			
			
			custom_spooky: {
				type: 'relative',
				notes: ['1/1', '1.6', '1.87']
			},
		},
		
		curr_scale: 'chromatic',
		scales: {
			'major': [1, 3, 5, 6, 8, 10, 12],
			'natural minor': [1, 3, 4, 6, 8, 9, 11],
			'harmonic minor': [1, 3, 4, 6, 8, 9, 12],
			'chromatic': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
		},
		
		createFromTemplate: function (tuning, scale)
		{
			let notes = this.tunings[tuning].notes;
			if (!this.tunings[tuning].scalable)
			{
				scale = 'chromatic';
				this.curr_scale = scale;
			}

			let myscale = this.scales[scale].slice (0, notes.length);
			this.graph_show_degrees = [0];
			this.initPlot();
			return myscale.map (n => notes[n - 1]);
		},
		
		add_scale_degree: function (pos)
		{
			let dropdown = this.dropdown;
			this.curr_notes.splice (pos + 1, 0, this.tunings[dropdown.tuning].notes[this.scales[dropdown.scale][dropdown.degree] - 1]);
			this.marker = pos + 1;
			dropdown.show = null;
			
			setTimeout ( () => {
				this.marker = null;
			}, 1500);
		},
		
		add_keymap_degree: function()
		{
			let keys = Object.keys (this.key_maps[this.curr_keymap]);
			let last = keys[keys.length - 1];
			this.key_maps[this.curr_keymap][parseInt (last) + 1] = '';
		},
		
		
		// todo: turn tunings into arrays
		curr_keymap: 'scale',
		key_maps: {
			scale: {
				0:'a' ,
				1:'s' ,
				2:'d' ,
				3:'f' ,
				4:'g' ,
				5:'h' ,
				6:'j' ,
				
				7: 'k,z,y',
				8: 'l,x',
				9: 'c',
				10: 'v',
				11: 'b',
				12: 'n',
				13: 'm',
				
			},
			chords: {
				0:'a,f2,h2' ,
				1:'s,g2,j' ,
				2:'a,d,h2' ,
				3:'s,f,j2' ,
				4:'a,d,g' ,
				5:'s,f,h' ,
				6:'j,d,g' ,
				
				7: 'z,y',
				8: 'x',
				9: 'c',
				10: 'v',
				11: 'b',
				12: 'n',
				13: 'm',
			}
		},
		
		getInterScaleRatios: function() {
			let result  = [];
			
			let playing = this.graph_show_degrees.map (d => mod (d, this.curr_notes.length) );
			playing.sort();
			for (let p=0; p < playing.length - 1; p++)
			{
				let rows = [];
				for (let pp = p + 1; pp < playing.length; pp++)
				{	
					try {							
						let expr = `( ${this.curr_notes[playing[pp]]}) / ( ${this.curr_notes[playing[p]]})`;
						rows.push ({i1: playing[p], i2: playing[pp], resolved: math.simplify (expr) , approx: math.evaluate (expr).toFixed(2)});
					}
					catch (err) {}
				}
				
				result.push (rows);
			}

			return result;
		
		},
		
		addPlotTrace: function (degree, octave) {
			// this is slow, use setTimeout to not block the main thread
			setTimeout ( () => {
				// calculate needed resolution
				// TODO: higher resolution for higher octaves
				let x = [];
				for (let i=0; i<Math.PI * (this.graph_periods); i += 1 / (100 / Math.PI * (this.graph_periods) ) )
				{
					x.push (i);
				}
				
				let octave_adj = octave < 0 ? 1 / -(octave - 1) : octave + 1;
			
				let trace = {
					x: x,
					y: x.map ( x =>  {
						return Math.sin ( math.evaluate ( `(${String (this.curr_notes[degree])}) * ${octave, octave_adj} * 2 * ${x}` ) );
					}),
					type: 'scatter',
					line: {
						shape: 'spline',
						color: this.colors[degree],
					},
					name: `${String ( (degree + 1) + (octave * this.curr_notes.length) ).padStart (5, ' ')} <br />`
				};

				Plotly.addTraces ('graph', trace);
			}, 0);
		},
		
		deletePlotTrace: function (degree) {
			setTimeout ( () => {
				try {
					Plotly.deleteTraces ( 'graph', degree);
				}
				catch (err) {}
			}, 0 );
		},
		
		toggleList: function (list, item) {
			if ( list.includes (item) ) {
				return list.filter (i => i != item);
			}
			else {
				list.push (item);
				return list;
			}
		},
		toggleGrapShowDegree: function (degree) {
			if ( this.graph_show_degrees.includes (degree) ) {
				this.deletePlotTrace ( this.graph_show_degrees.indexOf (degree) );
				this.graph_show_degrees = this.graph_show_degrees.filter (d => d != degree);
				
			}
			else {
				this.graph_show_degrees.push (degree);
				const [degree_adj, octave] = this.getOctave (degree);
				this.addPlotTrace (degree_adj, octave);
			}
		},
		
		get_note_by_key: function (keyChar)
		{
			let result = [];
			for  ( let k of Object.keys (this.key_maps[this.curr_keymap]) )
			{
				for ( let key of this.key_maps[this.curr_keymap][k].split (',') )
				{
					if (key.length == 1 && key == keyChar)
					{
						result.push ({note: parseInt (k), octave: 0});
					}
					
					else if (key.length > 1 && key[0] == keyChar)
					{
						let octave;
						try {
							octave = parseInt (key[1]);
						}
						catch (err) {}
						
						result.push ({note: parseInt (k), octave: octave - 1});
					}
				}
			}
			
			return result;
		},
		
		key_check_on: function (event)
		{
			let notes = this.get_note_by_key (event.key);
			for (let note of notes)
			{
				this.playNote ( note.note + (this.curr_notes.length * note.octave) );
			}
		},
		
		key_check_off: function (event)
		{
			let notes = this.get_note_by_key (event.key);
			for (let note of notes)
			{
				this.stopNote ( note.note + (this.curr_notes.length * note.octave) );
			}
		},
		
		midi: {
			tempo: 1,
			loaded: false,
			player: null,
			error: null,
			root: 'A',
			scheduledNotes: [],
		},
		
		note2freqMap: {
			'G#/Ab':	103.826 * octave_multi,
			'G':		97.9989 * octave_multi,
			'F#/Gb':	92.4986 * octave_multi,
			'F':		87.3071 * octave_multi,
			'E':		82.4069 * octave_multi,
			'D#/Eb':	77.7817 * octave_multi,
			'D':		73.4162 * octave_multi,
			'C#/Db':	69.2957 * octave_multi,
			'C':		65.4064 * octave_multi,
			'B':		61.7354 * octave_multi,
			'A#/Bb':	58.2705 * octave_multi,
			'A':		55 * octave_multi
		},
		
		readMidiFile: function (evt) {
			if (evt.files && evt.files[0]) {
				var myFile = evt.files[0];
				var reader = new FileReader();

				reader.addEventListener('load', (e) => {
					try {
						this.midi.player = new Midi (e.target.result);
						
						// detect key signature
						if ( this.midi.player.header?.keySignatures != null && this.midi.player.header.keySignatures.length > 0 )
						{
							this.midi.root = this.midi.player.header.keySignatures[0].key;
							this.root.note = this.midi.root;
							this.root.freq = this.note2freqMap[this.root.note];
							
							this.calcNoteOffset();
						}
						
						this.midi.loaded = true;
						this.midi.error = null;
					}
					catch (err) {
						this.midi.loaded = false;
						this.midi.error = err;
					}
				});

				reader.readAsArrayBuffer (myFile);
			}   
		},
		
		calcNoteOffset: function() {
			this.midi.note_offset = this.midi.scaleNotes.indexOf (this.midi.root);
		},
		
		midi_play: async function ()
		{
			let notes = this.midi.player.tracks.map ( track => track.notes.map ( note => {
				// TODO: understand why we need - 69 + 12 -3 ?
				let octave = Math.floor ( (note.midi - 69 + 12 - 3) / this.curr_notes.length);
				let degree = mod (note.midi - 69 + 12 - 3, this.curr_notes.length);
				note.n = degree + (octave * this.curr_notes.length) - this.midi.note_offset;
				if (track.notes.indexOf (note) == track.notes.length - 1)
				{
					note.last = true;
				}
				return note;
					
			} ) ).flat();
			console.log (notes);
			
			let d = Date.now();
			for (let note of notes)
			{
				let timer = new Tock ( () => {		
					//setTimeout ( () => {
						this.playNote (note.n);
					//}, 0);
					
					const timerStop = new Tock ( ()=> {
						this.stopNote (note.n);
						if (note.last)
						{
							this.midi.scheduledNotes = [];
						}
						
						timerStop.stop();
					}, ( note.durationTicks * (1/this.midi.tempo) ) - 350 );
					timerStop.start();
					
					timer.stop();
				}, note.ticks * (1/this.midi.tempo) );
				
				timer.start();
				this.midi.scheduledNotes.push (timer);
			
			}
			
			/*this.midi.player.tracks.forEach ( track => {
				const notes = track.notes;
				notes.forEach ( note => {
					
					this.midi.scheduledNotes.push ( setTimeout ( () => {
						
						//setTimeout ( () => {
							this.playNote (n);
						//}, 0);
						
						setTimeout ( () => {
							this.stopNote (n);
							if ( track.notes.indexOf (note) == track.notes.length - 1 )
							{
								this.midi.scheduledNotes = [];
							}
						}, (note.durationTicks * (1/this.midi.tempo) ) - 350 );
					}, note.ticks * (1/this.midi.tempo) ) );
				});
			});*/
		},
		
		midi_stop: function() {
			this.midi.scheduledNotes.forEach ( n => clearTimeout (n) );
			this.midi.scheduledNotes = [];
			this.stopAll();
		}		
	}
}


/*const getCircularReplacer = () => {
const seen = new WeakSet();
	return (key, value) => {
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) {
				return;
			}
			seen.add(value);
		}
		return value;
	};
};
Alpine.directive('debug', (el, { expression }, { evaluate }) => {
	el.style.backgroundColor = 'black'; 
	el.style.fontFamily = 'monospace'; 
	el.style.color = 'lightgreen'; 
	el.style.fontWeight = 'bold'; 
	el.style.padding = '0.5em'; 
	el.style.whiteSpace = 'pre'; 
	
	let v = evaluate (expression);
	console.log (v);
	el.textContent = JSON.stringify (v, getCircularReplacer, 2);
});*/
