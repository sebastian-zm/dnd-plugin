function create_npc(params, userSettings) {
  const {
    name,
    species,
    ac,
    max_hp,
    current_hp,
    temporary_hp,
    speeds,
    str,
    dex,
    con,
    int_,
    wis,
    cha,
    pb,
    skills,
    senses,
    languages,
    cr,
  } = params;

  if (!name) {
    throw new Error('The "name" argument is required.');
  }

  const npc = {
    name,
    species,
    ac,
    max_hp,
    current_hp: current_hp ?? max_hp,
    temporary_hp: temporary_hp ?? 0,
    speeds,
    str,
    dex,
    con,
    int: int_,
    wis,
    cha,
    pb,
    skills,
    senses,
    languages,
    cr,
  };

  // In a real implementation, you would save the NPC to a database.
  // For now, we'll just return the created NPC object.
  return npc;
};
