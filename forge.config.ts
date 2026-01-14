import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cpSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Amon',
    executableName: 'Amon',
    asar: {
      unpack: '**/node_modules/@anthropic-ai/**',
    },
    // 将 resources/skills、bun 和 uv 复制到打包目录的 resources 中
    extraResource: [
      './resources/skills',
      // bun 可执行文件（macOS/Linux）
      ...(process.platform !== 'win32' ? ['./resources/bun'] : []),
      // bun 可执行文件（Windows）
      ...(process.platform === 'win32' ? ['./resources/bun.exe'] : []),
      // uv 可执行文件（macOS/Linux）
      ...(process.platform !== 'win32' ? ['./resources/uv'] : []),
      // uv 可执行文件（Windows）
      ...(process.platform === 'win32' ? ['./resources/uv.exe'] : []),
      // jq 可执行文件（仅 Windows）
      ...(process.platform === 'win32' ? ['./resources/jq.exe'] : []),
      // git-portable（仅 Windows）
      ...(process.platform === 'win32' ? ['./resources/git-portable'] : []),
      // msys2（仅 Windows）
      ...(process.platform === 'win32' ? ['./resources/msys2'] : []),
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  hooks: {
    prePackage: async () => {
      // 在打包前确保运行时二进制文件已下载
      console.log('\n=== Running prePackage hook: downloading runtime binaries ===\n');
      const result = spawnSync('node', ['scripts/downloadRuntimeBinaries.js'], {
        stdio: 'inherit',
        shell: true,
      });
      if (result.status !== 0) {
        throw new Error('Failed to download runtime binaries');
      }
    },
    packageAfterCopy: async (_config, buildPath) => {
      // 将 claude-agent-sdk 复制到打包目录的 node_modules 中
      const sdkSrc = join(process.cwd(), 'node_modules', '@anthropic-ai');
      const sdkDest = join(buildPath, 'node_modules', '@anthropic-ai');

      if (existsSync(sdkSrc)) {
        mkdirSync(join(buildPath, 'node_modules'), { recursive: true });
        cpSync(sdkSrc, sdkDest, { recursive: true });
        console.log(`Copied @anthropic-ai SDK to ${sdkDest}`);
      }
    },
  },
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
        {
          name: 'settings_window',
          config: 'vite.settings.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
