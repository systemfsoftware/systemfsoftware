export interface AlibabaTokenPlanCredential {
	token: string;
	cookie?: string;
}

const TOKEN_PATTERN = /^sk-[A-Za-z0-9._~+/-]+={0,2}$/;

export function parseAlibabaTokenPlanCredential(value: string): AlibabaTokenPlanCredential | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (!trimmed.startsWith("{")) return TOKEN_PATTERN.test(trimmed) ? { token: trimmed } : null;
	try {
		const parsed = JSON.parse(trimmed) as { token?: unknown; cookie?: unknown };
		if (typeof parsed.token !== "string" || !TOKEN_PATTERN.test(parsed.token.trim())) return null;
		if (parsed.cookie !== undefined && typeof parsed.cookie !== "string") return null;
		const token = parsed.token.trim();
		const cookie = parsed.cookie?.trim();
		return cookie ? { token, cookie } : { token };
	} catch {
		return null;
	}
}

export function serializeAlibabaTokenPlanCredential(token: string, cookie: string): string {
	const trimmedCookie = cookie.trim();
	return trimmedCookie ? JSON.stringify({ token, cookie: trimmedCookie }) : token;
}
