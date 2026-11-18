// scrydex.js — Scrydex, the paid official successor to pokemontcg.io ($29/month Starter, 5,000 credits).
// STATUS: not built. Only needed if TCGdex falls short in the v0.3 check.
// Likely needs a Supabase Edge Function in front of it so the Scrydex key stays off phones.
// Docs: https://scrydex.com/docs

const notBuilt = () => {
  throw new Error('The Scrydex price source is not built yet (see ROADMAP.md, v0.3).');
};

export default {
  id: 'scrydex',
  label: 'Scrydex (paid)',
  needsKey: true,
  async findCards() { return notBuilt(); },
  async getByIds() { return notBuilt(); },
};
