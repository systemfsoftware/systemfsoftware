const USER_POLICY_DIR = '.config/systemfsoftware'
const PROJECT_POLICY_FILE = 'systemfsoftware.toml'
const LOCAL_POLICY_FILE = 'systemfsoftware.local.toml'

export const policyFilePaths = (homeDir: string, cwd: string): readonly string[] => [
  `${homeDir}/${USER_POLICY_DIR}/${PROJECT_POLICY_FILE}`,
  `${cwd}/${PROJECT_POLICY_FILE}`,
  `${cwd}/${LOCAL_POLICY_FILE}`,
]
