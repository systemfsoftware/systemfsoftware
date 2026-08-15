import * as api from "{{apiPackageName}}";
import typia from "typia";

/**
 * Validate that the generated health accessor reaches the running backend.
 *
 * The scaffold needs one infrastructure proof that the generated SDK can call
 * the application it describes. This test derives an anonymous connection from
 * the runner's base host, calls the health accessor, and validates its response
 * against the generated contract.
 *
 * 1. Derive an anonymous connection from the base host.
 * 2. Call the generated health accessor.
 * 3. Validate the response against its generated type.
 *
 * @param connection Base connection supplied by the dynamic e2e runner.
 */
export async function test_api_health(
  connection: api.IConnection,
): Promise<void> {
  // Step 1: Derive an anonymous connection from the base host
  const healthConnection: api.IConnection = { host: connection.host };

  // Step 2: Call the generated health accessor
  const value: string = await api.functional.health.get(healthConnection);

  // Step 3: Validate the response against its generated type
  typia.assert(value);
}
