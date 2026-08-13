/**
 * صوت تنبيه خفيف لرسائل الشات الجديدة — WebAudio بدون أي ملفات.
 */
let ctx: AudioContext | null = null;

export function playSoftBeep(): void {
  try {
    if (typeof window === "undefined" || document.visibilityState !== "visible") return;
    ctx ??= new (window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // الصوت غير متاح — نتجاهل بصمت
  }
}
