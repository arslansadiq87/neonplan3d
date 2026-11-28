/** Keeps a persisted visibility request authoritative while its renderer loads lazily. */
export class LazyVisibility {
  private generation = 0;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private current: boolean;
  private readonly load: () => Promise<void>;
  private readonly apply: (visible: boolean) => void;

  constructor(
    load: () => Promise<void>,
    apply: (visible: boolean) => void,
    initial = false,
  ) {
    this.load = load;
    this.apply = apply;
    this.current = initial;
  }

  get visible(): boolean {
    return this.current;
  }

  /** Scene builders read this on every rebuild, including floor and plan switches. */
  sceneRebuilt(): boolean {
    return this.current;
  }

  async set(visible: boolean): Promise<void> {
    const generation = ++this.generation;
    if (visible && !this.loaded) {
      this.loading ??= this.load().then(
        () => {
          this.loaded = true;
        },
        (error: unknown) => {
          this.loading = null;
          throw error;
        },
      );
      await this.loading;
    }
    if (generation !== this.generation || visible === this.current) return;
    this.current = visible;
    this.apply(visible);
  }
}
