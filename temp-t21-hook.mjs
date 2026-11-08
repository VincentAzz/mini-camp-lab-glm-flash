// temp-t21-hook.mjs —— T21 headless 验收的 '@/…' 解析钩子（同 verify-t29t30 脚本头注记的 inline hook，
// 改落临时文件避免 bash 转义损耗；验收后按清理流程处理，勿提交）。
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      return next(pathToFileURL(process.cwd() + '/src/' + p).href, context);
    }
    // 源码内部相对导入（bundler 风格无扩展名）：补 .ts 再交默认解析（three/addons 等裸名不受影响）
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.includes('/src/')
      && !/\.[cm]?[jt]sx?$/.test(specifier.split('/').pop() ?? '')) {
      const base = new URL(specifier, context.parentURL).href;
      return next(base + '.ts', context);
    }
    return next(specifier, context);
  },
});
