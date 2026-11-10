/**
 * Lo que usamos del Web Playback SDK de Spotify (https://sdk.scdn.co/spotify-player.js), que no
 * publica tipos. Referencia: https://developer.spotify.com/documentation/web-playback-sdk/reference
 */
declare namespace Spotify {
  type Error = { message: string };

  type Track = {
    uri: string;
    id: string | null;
    name: string;
    is_playable: boolean;
    album: { uri: string; name: string; images: { url: string; height?: number; width?: number }[] };
    artists: { uri: string; name: string }[];
  };

  type PlaybackState = {
    paused: boolean;
    /** ms */
    position: number;
    /** ms */
    duration: number;
    track_window: { current_track: Track | null; previous_tracks: Track[]; next_tracks: Track[] };
    disallows: Partial<Record<"pausing" | "resuming" | "seeking" | "skipping_next" | "skipping_prev", boolean>>;
  };

  type Listeners = {
    ready: (p: { device_id: string }) => void;
    not_ready: (p: { device_id: string }) => void;
    player_state_changed: (state: PlaybackState | null) => void;
    autoplay_failed: () => void;
    initialization_error: (e: Error) => void;
    authentication_error: (e: Error) => void;
    account_error: (e: Error) => void;
    playback_error: (e: Error) => void;
  };

  class Player {
    constructor(options: { name: string; getOAuthToken: (cb: (token: string) => void) => void; volume?: number });
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener<E extends keyof Listeners>(event: E, cb: Listeners[E]): boolean;
    removeListener<E extends keyof Listeners>(event: E, cb?: Listeners[E]): boolean;
    getCurrentState(): Promise<PlaybackState | null>;
    getVolume(): Promise<number>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    activateElement(): Promise<void>;
  }
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: typeof Spotify;
}
