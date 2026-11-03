/** A token match alone misses rapid A→B→A auth changes before React rerenders. */
export function isCurrentAuthRequest(capturedEpoch, currentEpoch, capturedToken, currentToken) {
    return Number.isSafeInteger(capturedEpoch) && capturedEpoch === currentEpoch &&
        typeof capturedToken === "string" && capturedToken.length > 0 && capturedToken === currentToken;
}
