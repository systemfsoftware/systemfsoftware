import { DynamicModule } from "@nestia/core";
import type { ModuleMetadata } from "@nestjs/common/interfaces";
import path from "node:path";

/**
 * Owns the one controller population shared by runtime and Nestia generation.
 */
export namespace MyModule {
  /**
   * Discovers every runtime controller and mounts shared Nest metadata.
   *
   * @param metadata Shared imports, providers, exports, and module metadata.
   * @returns A Nest module containing the discovered controller population.
   */
  export const mount = async (
    metadata: Omit<ModuleMetadata, "controllers"> = {},
  ) => {
    const directory: string = path.join(__dirname, "controllers");
    const module = await DynamicModule.mount(
      directory,
      metadata,
      __filename.endsWith(".ts"),
    );
    return module;
  };
}
