import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { spawnSync } from 'child_process';
import { cpSync, mkdirSync } from 'fs';
import path from 'path';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Amon',
    executableName: 'Amon',
    // 应用图标
    icon: './resources/icons/icon',
    // macOS 特定配置
    appBundleId: 'com.liruifengv.amon',
    appCategoryType: 'public.app-category.productivity',
    asar: true,
    // 将 resources 中的运行时二进制复制到打包目录
    extraResource: [
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
      // workspace 模板文件
      './resources/templates',
      // 内置 skills
      './skills',
    ],
  },
  rebuildConfig: {},
  makers: [
    // macOS ZIP
    new MakerZIP({}, ['darwin']),
    // macOS DMG
    new MakerDMG({
      format: 'UDZO',
      icon: './resources/icons/icon.icns',
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'liruifengv',
        name: 'amon-agent',
      },
      prerelease: false,
      draft: false, // 先创建为 Draft，手动检查后再发布
      generateReleaseNotes: false, // 使用 Changeset 生成的 CHANGELOG 作为 Release Notes
    }),
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
    packageAfterCopy: async (_config, _buildPath) => {
      const buildPath = _buildPath;
      const appNodeModules = path.join(buildPath, 'node_modules');
      const sourceNodeModules = path.join(process.cwd(), 'node_modules');

      mkdirSync(appNodeModules, { recursive: true });

      const copyRuntimePackage = (packageName: string, runtimePaths: string[]) => {
        const sourceDir = path.join(sourceNodeModules, packageName);
        const targetDir = path.join(appNodeModules, packageName);
        mkdirSync(targetDir, { recursive: true });
        for (const runtimePath of runtimePaths) {
          cpSync(
            path.join(sourceDir, runtimePath),
            path.join(targetDir, runtimePath),
            { recursive: true },
          );
        }
      };

      copyRuntimePackage('turndown', ['package.json', 'lib']);
      copyRuntimePackage('@mixmark-io/domino', ['package.json', 'lib']);
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
