import type { NextConfig } from "next";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

function commonAncestor(left: string, right: string): string | undefined {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  if (path.parse(leftPath).root.toLowerCase() !== path.parse(rightPath).root.toLowerCase()) return undefined;

  const leftParts = leftPath.split(path.sep);
  const rightParts = rightPath.split(path.sep);
  let index = 0;
  while (index < leftParts.length && index < rightParts.length && leftParts[index].toLowerCase() === rightParts[index].toLowerCase()) {
    index += 1;
  }
  return leftParts.slice(0, index).join(path.sep);
}

const nodeModulesPath = path.join(process.cwd(), "node_modules");
const realNodeModulesPath = existsSync(nodeModulesPath) ? realpathSync.native(nodeModulesPath) : nodeModulesPath;
const sharedDependencyRoot = path.resolve(realNodeModulesPath) !== path.resolve(nodeModulesPath)
  ? commonAncestor(process.cwd(), realNodeModulesPath)
  : undefined;

const nextConfig: NextConfig = {
  ...(sharedDependencyRoot ? { turbopack: { root: sharedDependencyRoot } } : {}),
};

export default nextConfig;
