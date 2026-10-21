const CONCERNING = [
  /\bstarv(e|ing|ation)\b/i,
  /\bpurg(e|ing)\b/i,
  /\bthrow(ing)? up\b/i,
  /\bmake (myself|me) (throw up|sick)\b/i,
  /\b(not|stop) eating\b/i,
  /\b(skip|skipping) (all )?meals\b/i,
  /\blaxatives?\b/i,
  /\bunder [1-7]\d{2} (cal|kcal|calories)\b/i,
];

export function isConcerning(...texts: (string | undefined)[]) {
  return texts.some((t) => t && CONCERNING.some((re) => re.test(t)));
}

export const SUPPORT_MESSAGE = {
  title: "Want to talk to someone?",
  body: "It sounds like food might be feeling hard right now. You don't have to figure it out alone.",
  resourceName: "National Alliance for Eating Disorders helpline",
  resourceUrl: "https://www.allianceforeatingdisorders.com/",
};
