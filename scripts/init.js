
import {ItemsWithSpells5e} from './classes/defaults.js';
import {ItemsWithSpells5eActorSheet} from './classes/actor-sheet.js';
import {ItemsWithSpells5eActor} from './classes/actor.js';
import {ItemsWithSpells5eItem} from './classes/item-sheet.js';
import {ItemsWithSpells5eItemSheet} from './classes/item-sheet.js';
import {_registerSettings} from './classes/settings.mjs';
import {ItemsWithSpells5eExtendHUD} from './extensions/token-action-hud-dnd5e.js';

Hooks.once("setup", _registerSettings);
Hooks.once("init", ItemsWithSpells5eActor.init);
Hooks.once("init", ItemsWithSpells5eActorSheet.init);
Hooks.once("init", ItemsWithSpells5e.init);
Hooks.once("init", ItemsWithSpells5eItemSheet.init);
Hooks.once("init", ItemsWithSpells5eExtendHUD.init);
Hooks.once("ready", async () => {
  const module = game.modules.get(ItemsWithSpells5e.MODULE_ID);
  module.api = {
    isIwsItem: ItemsWithSpells5e.isIwsItem,
    isIwsSpell: ItemsWithSpells5e.getSpellParentId,
    getItemSpells: ItemsWithSpells5eItem.getItemSpells,
    getSpellParentId: ItemsWithSpells5e.getSpellParentId,
    getSpellParentItem: ItemsWithSpells5e.getSpellParentItem,
    isIncludedItemType: ItemsWithSpells5e.isIncludedItemType,
    isUsableItem: ItemsWithSpells5e.isUsableItem
  }
});