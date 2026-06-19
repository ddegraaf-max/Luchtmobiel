/* Interactieve Chinook-overvlucht.
   Het geluid wordt live opgewekt met de Web Audio API (geen geluidsbestand nodig):
   een laagfrequente motorroffel met het kenmerkende "wokka-wokka"-ritme,
   die van links naar rechts pant met een lichte Doppler-toonsverschuiving. */
(function () {
  var bezig = false;

  function overvlucht() {
    if (bezig) return;
    bezig = true;
    var knop = document.querySelector('.heli-knop');
    var heli = document.querySelector('.heli-vlucht');
    if (knop) knop.disabled = true;
    if (heli) { heli.classList.remove('vliegt'); void heli.offsetWidth; heli.classList.add('vliegt'); }
    try { speelGeluid(); } catch (e) { /* audio niet beschikbaar: animatie speelt toch */ }
    setTimeout(function () {
      bezig = false;
      if (knop) knop.disabled = false;
      if (heli) heli.classList.remove('vliegt');
    }, 7400);
  }

  function speelGeluid() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    var dur = 7.0;
    var t0 = ctx.currentTime;

    // Master + stereo pan (links -> rechts = "vliegt langs")
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.62, t0 + dur * 0.5);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    if (ctx.createStereoPanner) {
      var pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-1, t0);
      pan.pan.linearRampToValueAtTime(1, t0 + dur);
      master.connect(pan);
      pan.connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }

    // "wokka-wokka": een LFO die de amplitude moduleert
    var lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.setValueAtTime(4.6, t0);
    lfo.frequency.linearRampToValueAtTime(6.2, t0 + dur * 0.5); // sneller als hij dichtbij is
    lfo.frequency.linearRampToValueAtTime(4.2, t0 + dur);

    // Motorroffel: ruisbed door een laagdoorlaatfilter
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // bruine ruis
      data[i] = last * 3.4;
    }
    var noise = ctx.createBufferSource();
    noise.buffer = buf;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    var amp = ctx.createGain();
    amp.gain.value = 0;
    var lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.95;
    lfo.connect(lfoDepth);
    lfoDepth.connect(amp.gain);
    noise.connect(lp); lp.connect(amp); amp.connect(master);

    // Lage dreun (rotorslag)
    var thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.value = 62;
    var thGain = ctx.createGain();
    thGain.gain.value = 0;
    var thDepth = ctx.createGain();
    thDepth.gain.value = 0.55;
    lfo.connect(thDepth);
    thDepth.connect(thGain.gain);
    thump.connect(thGain); thGain.connect(master);

    // Turbinegier met Doppler (omhoog bij naderen, omlaag bij wegvliegen)
    var whine = ctx.createOscillator();
    whine.type = 'triangle';
    whine.frequency.setValueAtTime(780, t0);
    whine.frequency.linearRampToValueAtTime(940, t0 + dur * 0.45);
    whine.frequency.linearRampToValueAtTime(640, t0 + dur);
    var whGain = ctx.createGain();
    whGain.gain.value = 0.05;
    whine.connect(whGain); whGain.connect(master);

    var tEnd = t0 + dur;
    noise.start(t0); lfo.start(t0); thump.start(t0); whine.start(t0);
    noise.stop(tEnd); lfo.stop(tEnd); thump.stop(tEnd); whine.stop(tEnd);
    setTimeout(function () { if (ctx.close) ctx.close(); }, (dur + 0.4) * 1000);
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.heli-knop')) overvlucht();
  });
})();
