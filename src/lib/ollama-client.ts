export async function generateAI(type: 'report' | 'minutes' | 'advice', requisitionId: string, options?: { model?: string; prompt?: string }) {
    const body = {
        type,
        requisitionId,
        model: options?.model,
        prompt: options?.prompt,
    };

    // Try to attach the stored auth token (used across the app)
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            throw new Error('Unauthorized: please login with an account that has access.');
        }
        const err = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(err.error || 'AI request failed');
    }
    const data = await res.json();
    return data.result as string;
}
