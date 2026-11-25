/** Painted-fantasy looks per land: landscape, sky, grass, light. */
import type { WorldId } from '../sim/defs';
import type { LandStyle } from './landscape';
import type { SkyStyle } from './sky';
import type { GrassStyle } from './grass';

export interface WorldLook {
  land: LandStyle;
  sky: SkyStyle;
  grass: GrassStyle;
  fog: string;
  fogDensity: number;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  exposure: number;
  particles: 'petals' | 'dust' | 'snow' | 'embers' | 'motes';
}

export const LOOKS: Record<WorldId, WorldLook> = {
  meadow: {
    land: {
      grass: ['#86c450', '#70b347', '#9acd5c', '#649f3f'], dry: '#c9c46e', dirt: '#b89c6a', rock: ['#a29d92', '#8d887e', '#b8b2a6'],
      sand: '#dccb9f', snow: false, water: '#62c2dc', waterDeep: '#22689c', lava: false, frozen: false,
      trees: ['treeRound', 'treeRound', 'treePine', 'treeRound'], bushes: ['bush'], rocks: ['rock'], small: ['flower'], ruins: ['column', 'arch', 'brokenColumn'],
      leaves: ['#4f9d3b', '#68b648', '#3f8a37', '#7cc152', '#5aa844'], trunk: '#7a5236', flowers: ['#ff7aa8', '#ffd84a', '#ffffff', '#b78cff', '#ff9a5a'], accent: '#ffcf5a',
      hilliness: 1, treeDensity: 1,
    },
    sky: {
      top: '#2a78d6', horizon: '#bfe0f6', sunGlow: '#ffd8a0', cloud: '#ffffff', cloudShade: '#aebfd6', sunDir: [0.55, 0.5, -0.65],
      cloudCover: 0.42, stars: 0, aurora: 0, mountains: ['#6d97b3', '#8fb2cc', '#b1cbe0'], snow: true, mountainHeight: 120,
    },
    grass: { base: '#5a9a37', tip: '#cfe87c', dry: '#e2d68a', height: 0.85 },
    fog: '#bcd5ec', fogDensity: 0.0042, sun: '#ffe6bd', sunIntensity: 3.2, hemiSky: '#bfdcff', hemiGround: '#5f7f3a', hemiIntensity: 1.0, exposure: 1.0,
    particles: 'petals',
  },
  desert: {
    land: {
      grass: ['#e6c48a', '#dbb675', '#edcf98', '#d6aa6a'], dry: '#e0b97c', dirt: '#c49566', rock: ['#d0894f', '#bd733f', '#e3a26a'],
      sand: '#f0d7a2', snow: false, water: '#3fd0bd', waterDeep: '#128a92', lava: false, frozen: false,
      trees: ['palm', 'cactus', 'cactus', 'mesa'], bushes: ['dryBush', 'cactus'], rocks: ['rock', 'mesa'], small: ['dryBush'], ruins: ['arch', 'column', 'pot', 'brokenColumn'],
      leaves: ['#5f9c3e', '#79ad45', '#4a8a3a'], trunk: '#8a6240', flowers: ['#ff5a7a', '#ffb13d', '#ff7ad1'], accent: '#ffb347',
      hilliness: 0.8, treeDensity: 0.45,
    },
    sky: {
      top: '#3a8fe0', horizon: '#ffe2b0', sunGlow: '#ffc07a', cloud: '#fff8ec', cloudShade: '#d9b9a0', sunDir: [-0.6, 0.42, -0.6],
      cloudCover: 0.22, stars: 0, aurora: 0, mountains: ['#c98a5c', '#d9a77c', '#e9c4a0'], snow: false, mountainHeight: 90,
    },
    grass: { base: '#a08a3a', tip: '#e6d48a', dry: '#e9cf8a', height: 0.45 },
    fog: '#f4dcbc', fogDensity: 0.0058, sun: '#ffe0b0', sunIntensity: 3.4, hemiSky: '#ffe9cc', hemiGround: '#c49460', hemiIntensity: 1.0, exposure: 0.98,
    particles: 'dust',
  },
  ice: {
    land: {
      grass: ['#eef5fc', '#e3eef9', '#f7fbff', '#dbe7f4'], dry: '#cfdff0', dirt: '#b9cde0', rock: ['#7f93ab', '#6a7f98', '#97aac0'],
      sand: '#e9f2fb', snow: true, water: '#bfe7ff', waterDeep: '#7fbfe6', lava: false, frozen: true,
      trees: ['pineSnow', 'pineSnow', 'iceSpire', 'pineSnow'], bushes: ['snowBush', 'iceCrystal'], rocks: ['rock', 'iceCrystal'], small: ['iceCrystal'], ruins: ['iceSpire', 'column'],
      leaves: ['#2f6b5a', '#3b7d68', '#285c4f'], trunk: '#5b4637', flowers: ['#8fe9ff', '#c8a8ff', '#ffffff'], accent: '#8fe2ff',
      hilliness: 1.2, treeDensity: 0.8,
    },
    sky: {
      top: '#1b2d5e', horizon: '#9cc0e8', sunGlow: '#ffd2e8', cloud: '#eef4ff', cloudShade: '#8fa6c8', sunDir: [-0.4, 0.32, -0.75],
      cloudCover: 0.35, stars: 0.35, aurora: 1, mountains: ['#7f9cc0', '#9fb9d9', '#c4d6ec'], snow: true, mountainHeight: 140,
    },
    grass: { base: '#c9dbe9', tip: '#ffffff', dry: '#e6eef8', height: 0.3 },
    fog: '#b9d0ea', fogDensity: 0.0072, sun: '#e7f0ff', sunIntensity: 2.6, hemiSky: '#c4dcff', hemiGround: '#eef4ff', hemiIntensity: 1.2, exposure: 0.95,
    particles: 'snow',
  },
  forge: {
    land: {
      grass: ['#4a3d3b', '#55463f', '#3e3434', '#5f4a40'], dry: '#6a5246', dirt: '#5c4a42', rock: ['#2f2729', '#3d3132', '#252022'],
      sand: '#3a2c2a', snow: false, water: '#ff6a1f', waterDeep: '#ffb43a', lava: true, frozen: false,
      trees: ['deadTree', 'obsidian', 'deadTree', 'chimney'], bushes: ['lavaRock'], rocks: ['obsidian', 'lavaRock', 'rock'], small: ['lavaRock'], ruins: ['anvil', 'chimney', 'brokenColumn'],
      leaves: ['#4a3b33', '#5b463a'], trunk: '#2f2522', flowers: ['#ff7a2a', '#ffcf4a'], accent: '#ff7a2a',
      hilliness: 1.3, treeDensity: 0.55,
    },
    sky: {
      top: '#1a0c10', horizon: '#9a3b1f', sunGlow: '#ff8a3a', cloud: '#6a3a30', cloudShade: '#2a1416', sunDir: [0.5, 0.25, -0.8],
      cloudCover: 0.6, stars: 0.15, aurora: 0, mountains: ['#3a2224', '#5a2c24', '#7a3a26'], snow: false, mountainHeight: 130,
    },
    grass: { base: '#3a2a26', tip: '#7a5a44', dry: '#8a6448', height: 0.22 },
    fog: '#5a2a1c', fogDensity: 0.0095, sun: '#ffb07a', sunIntensity: 2.4, hemiSky: '#ff9a6a', hemiGround: '#2a1a18', hemiIntensity: 0.9, exposure: 1.05,
    particles: 'embers',
  },
  citadel: {
    land: {
      grass: ['#d7d3dc', '#c9c5cf', '#e1dde6', '#bcb8c4'], dry: '#b5b0bd', dirt: '#8a8694', rock: ['#a09caa', '#8b8796', '#b6b2bf'],
      sand: '#cfcbd6', snow: false, water: '#7a6cff', waterDeep: '#2a1f7a', lava: false, frozen: false,
      trees: ['greyTree', 'column', 'shard', 'statue'], bushes: ['brokenColumn', 'shard'], rocks: ['rock', 'shard'], small: ['shard'], ruins: ['column', 'arch', 'statue', 'brokenColumn'],
      leaves: ['#8f8b99', '#a5a1ad'], trunk: '#5b5866', flowers: ['#ffd36b', '#ffffff', '#c9b8ff'], accent: '#ffd36b',
      hilliness: 0.9, treeDensity: 0.5,
    },
    sky: {
      top: '#0c0a1c', horizon: '#5a5088', sunGlow: '#c9b8ff', cloud: '#8a80b8', cloudShade: '#3a3460', sunDir: [-0.3, 0.4, -0.85],
      cloudCover: 0.5, stars: 0.9, aurora: 0.25, mountains: ['#3d385c', '#4f4874', '#6a628e'], snow: false, mountainHeight: 150,
    },
    grass: { base: '#8f8b9a', tip: '#d9d5e2', dry: '#b9b5c4', height: 0.4 },
    fog: '#4a4470', fogDensity: 0.0085, sun: '#e9e4ff', sunIntensity: 2.4, hemiSky: '#b7b0ff', hemiGround: '#5a5668', hemiIntensity: 1.05, exposure: 1.05,
    particles: 'motes',
  },
};

/**
 * The ending: the Citadel's land once the Silence has joined the music. It starts grey like the rest
 * of the Citadel (the colour is held back) and blooms into blossoms, green fields and a dusk sky.
 */
export const FINALE_LOOK: WorldLook = {
  land: {
    grass: ['#7cc46a', '#68b45c', '#93d27a', '#5ea352'], dry: '#cfd28a', dirt: '#a88f72', rock: ['#a7a2b4', '#928da2', '#bdb8c9'],
    sand: '#e2d6b8', snow: false, water: '#6fb8ff', waterDeep: '#2b4fae', lava: false, frozen: false,
    trees: ['treeRound', 'treeRound', 'column', 'treeRound', 'treePine'], bushes: ['bush'], rocks: ['rock', 'shard'], small: ['flower', 'flower', 'mushroom'], ruins: ['column', 'arch', 'statue', 'brokenColumn'],
    leaves: ['#ff9ec7', '#ffc2dd', '#c9a0ff', '#9fd46a', '#ffb3d1'], trunk: '#6e4a3a', flowers: ['#ffd36b', '#ffffff', '#c9b8ff', '#ff7aa8', '#7ad7ff'], accent: '#ffd36b',
    hilliness: 0.9, treeDensity: 0.9,
  },
  sky: {
    top: '#1b1d4a', horizon: '#f0a6a0', sunGlow: '#ffc58a', cloud: '#ffd6e0', cloudShade: '#7a6aa8', sunDir: [-0.3, 0.22, -0.85],
    cloudCover: 0.4, stars: 0.8, aurora: 0.3, mountains: ['#4a4a7c', '#6a6496', '#8c84b0'], snow: false, mountainHeight: 150,
  },
  grass: { base: '#4f9a45', tip: '#d6f08a', dry: '#e2d68a', height: 0.75 },
  fog: '#8a7fb0', fogDensity: 0.006, sun: '#ffd2a8', sunIntensity: 2.8, hemiSky: '#c9c0ff', hemiGround: '#4f7a3f', hemiIntensity: 1.05, exposure: 1.05,
  particles: 'motes',
};
