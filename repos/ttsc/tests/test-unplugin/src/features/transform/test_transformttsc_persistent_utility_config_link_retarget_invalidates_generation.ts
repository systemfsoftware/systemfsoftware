import { assertPersistentUtilityConfigLinkRetargetInvalidatesTransform } from "../../internal/transform-utility-plugin-config";

/** A same-content config dependency link retarget cannot retain old output. */
export const test_transformttsc_persistent_utility_config_link_retarget_invalidates_generation =
  async () => {
    await assertPersistentUtilityConfigLinkRetargetInvalidatesTransform();
  };
