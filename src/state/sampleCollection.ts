/**
 * Sample collection — interface preview only.
 *
 * These entries are clearly flagged `sample: true` in the UI and can be removed
 * in one click from Settings. They exist so the library, playlist and widget
 * surfaces can be evaluated before a real folder is imported. No audio is
 * bundled: the transport advances in real time so every control is exercised.
 * Imported files always play real audio.
 */

import artFallback from "../assets/art-fallback.jpg";
import art1 from "../assets/art-1.jpg";
import art2 from "../assets/art-2.jpg";
import art3 from "../assets/art-3.jpg";
import type { FolderPlaylist, Track } from "../types";
import { trackKey } from "../lib/path";

interface SampleFolderSpec {
  name: string;
  folderArtist: string;
  path: string;
  art: string;
  tracks: Array<{ title: string; duration: number; album: string }>;
}

const SPEC: SampleFolderSpec[] = [
  {
    name: "Nocturne Sessions",
    folderArtist: "Ilse Varga",
    path: "C:\\Users\\You\\Music\\Nocturne Sessions",
    art: art1,
    tracks: [
      { title: "Slow Glass", duration: 254, album: "Nocturne Sessions" },
      { title: "Halflight Over Still Water", duration: 322, album: "Nocturne Sessions" },
      { title: "Prelude for a Quiet Room", duration: 187, album: "Nocturne Sessions" },
      { title: "Blue Hour (Reprise)", duration: 231, album: "Nocturne Sessions" },
    ],
  },
  {
    name: "Glassworks EP",
    folderArtist: "Marek Oyelaran",
    path: "C:\\Users\\You\\Music\\Glassworks EP",
    art: art2,
    tracks: [
      { title: "Folded Paper", duration: 208, album: "Glassworks" },
      { title: "Aperture", duration: 276, album: "Glassworks" },
      { title: "Dust in the Beam", duration: 341, album: "Glassworks" },
    ],
  },
  {
    name: "Dusk Field Recordings",
    folderArtist: "Field Recordings",
    path: "C:\\Users\\You\\Music\\Dusk Field Recordings",
    art: art3,
    tracks: [
      { title: "Marsh at 19:40", duration: 412, album: "Dusk Field Recordings" },
      { title: "Rain on the Studio Window", duration: 528, album: "Dusk Field Recordings" },
      { title: "Last Ferry", duration: 296, album: "Dusk Field Recordings" },
    ],
  },
];

const LOOSE = [
  { title: "Aubade", artist: "Ilse Varga", album: "Loose Singles", duration: 198, file: "Ilse Varga - Aubade.flac" },
  { title: "Winter Sketch No. 2", artist: "Marek Oyelaran", album: "Loose Singles", duration: 163, file: "Marek Oyelaran - Winter Sketch No. 2.mp3" },
  { title: "Untitled (Tape Loop)", artist: undefined, album: undefined, duration: 245, file: "untitled tape loop.wav" },
];

export const FALLBACK_ART = artFallback;

export function buildSampleLibrary(): {
  folders: FolderPlaylist[];
  tracks: Record<string, Track>;
  looseTrackIds: string[];
} {
  const tracks: Record<string, Track> = {};
  const folders: FolderPlaylist[] = [];
  const looseTrackIds: string[] = [];

  SPEC.forEach((spec, folderIndex) => {
    const folderId = `sample-folder-${folderIndex}`;
    const trackIds: string[] = [];
    spec.tracks.forEach((track, i) => {
      const path = `${spec.path}\\${String(i + 1).padStart(2, "0")}. ${track.title}.flac`;
      const id = trackKey(path);
      tracks[id] = {
        id,
        title: track.title,
        artist: spec.folderArtist,
        album: track.album,
        duration: track.duration,
        path,
        key: id,
        artwork: spec.art,
        sourceKind: "sample",
        folderId,
      };
      trackIds.push(id);
    });
    folders.push({
      id: folderId,
      name: spec.name,
      path: spec.path,
      trackIds,
      recursive: false,
      missing: false,
      addedAt: Date.now() - (folderIndex + 1) * 86_400_000,
      lastScannedAt: Date.now() - 3_600_000,
      sample: true,
    });
  });

  LOOSE.forEach((entry, i) => {
    const path = `C:\\Users\\You\\Music\\Singles\\${entry.file}`;
    const id = trackKey(path + i);
    tracks[id] = {
      id,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      duration: entry.duration,
      path,
      key: id,
      artwork: [art2, art1, art3][i % 3],
      sourceKind: "sample",
    };
    looseTrackIds.push(id);
  });

  return { folders, tracks, looseTrackIds };
}
