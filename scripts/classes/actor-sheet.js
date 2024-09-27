import {ItemsWithSpells5e as IWS} from './defaults.js';

/* A class made to make managing the operations for an Actor. */
export class ItemsWithSpells5eActorSheet {
  /* Set up the Actor Sheet Patch */
  static init() {
    const id = IWS.MODULE_ID;
    const fn = ItemsWithSpells5eActorSheet.prepareItemSpellbook;
    ["Character", "NPC"].forEach(a => {
      libWrapper.register(id, `dnd5e.applications.actor.ActorSheet5e${a}.prototype._prepareSpellbook`, fn, "WRAPPER");
    });
  }

  /**
   * Filter iws spells into their own sections, removing them from standard sections.
   * @param {Function} wrapped      A wrapping function.
   * @param {object} data           The sheet data. **will be mutated**
   * @param {Item5e[]} spells       The actor's spells.
   * @returns {object}              The spellbook data.
   */
  static prepareItemSpellbook(wrapped, data, spells) {
    const order = game.settings.get(IWS.MODULE_ID, "sortOrder") ? 20 : -5;
    const createSection = (iws, uses = {}, spells = []) => {
      return {
        order: order,
        label: iws.name,
        usesSlots: false,
        canCreate: false,
        canPrepare: false,
        spells,
        uses: uses.value ?? "-",
        slots: uses.max ?? "-",
        override: 0,
        dataset: {"iws-item-id": iws.id},
        prop: "item-"+iws.id
      };
    };

    // iterate through spells and put them in respective maps
    const nonItemSpells = [];
    const spellsPerItem = new Map();
    spells.forEach((spell) => {
      const parentId = IWS.getSpellParentId(spell);
      if ( parentId && this.actor.items.some(item => [item.id, item.uuid].includes(parentId)) ) {
        const parentIdLast = parentId.split('.').pop();
        if (!spellsPerItem.get(parentIdLast)) spellsPerItem.set(parentIdLast, []);
        spellsPerItem.get(parentIdLast).push(spell);
      } else {
        nonItemSpells.push(spell);
      }
    });

    const spellbook = wrapped(data, nonItemSpells);

    // get all the items with spells on this actor
    const itemsWithSpells = this.actor.items.filter(item => {
      const fl = IWS.isIwsItem(item);
      if (!fl) return false;
      const include = IWS.isIncludedItemType(item.type);
      return include;
    });

    // create a new spellbook section for each item with spells attached
    itemsWithSpells.forEach((iws) => {
      const iwsSpells = spellsPerItem.get(iws.id);
      if (!iwsSpells) return;
      const iwsUsable = IWS.isUsableItem(iws);
      if (!iwsUsable) return;
      const section = createSection(iws, iws.system.uses, iwsSpells);
      spellbook.push(section);
    });

    spellbook.sort((a, b) => (a.order - b.order) || (a.label - b.label));
    return spellbook;
  }
}
