/** Count playback intervals, excluding pauses, buffering, and seeking. */
export class ListenProgress {
  seconds = 0
  private anchor: { position: number; time: number } | null = null

  sample(position: number, time: number, rate = 1) {
    if (!Number.isFinite(position) || !Number.isFinite(time) || !Number.isFinite(rate) || rate <= 0) return
    if (this.anchor) {
      const media = position - this.anchor.position
      const elapsed = Math.max(0, (time - this.anchor.time) / 1000) * rate
      this.seconds += Math.max(0, Math.min(media, elapsed))
    }
    this.anchor = { position, time }
  }

  suspend() { this.anchor = null }

  qualifies(duration: number) {
    const threshold = Number.isFinite(duration) && duration > 0 && duration < 30 ? duration / 2 : 30
    return this.seconds >= threshold
  }
}
