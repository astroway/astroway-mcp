/** Sent in initialize. Clients put it in the model's context before the first tool call. */
export function stdioInstructions(discoveryMode: boolean): string {
  const picking = discoveryMode
    ? 'This server runs in discovery mode: call astroway_find_tool with what the user wants, then astroway_call_tool with the name it returns. Never invent a tool name.'
    : 'Pick a tool by its name and description. Never invent a tool name or an endpoint path: when nothing fits, tell the user the API has no such calculation. ASTROWAY_TOOL_GROUPS narrows this list to the subjects you use.';
  return [
    'AstroWay astrology API. Each astroway_* tool calls one REST endpoint and spends credits from the key owner\'s account; the price is on the [Cost] line of its description.',
    picking,
    'Ask the user for a missing birth date, time or place instead of guessing one. A wrong birth time moves the houses and angles without any error.',
    'Confirm with the user before a tool marked Heavy or Premium. astroway_cost_estimate prices a plan of several calls without running them; astroway_account_status shows the remaining balance.',
    'Results are computed, not written. Do not add positions, aspects or dates a tool did not return.',
  ].join('\n\n');
}
