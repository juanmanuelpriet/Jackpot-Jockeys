export const getRandomBetPhrase = (userId: number, amount: number, horse: string) => {
    const templates = [
        `¡Jugador ${userId} le tira $${amount} sin asco a ${horse}!`,
        `$${amount} más al pozo: Jugador ${userId} tiene fe ciega en ${horse}.`,
        `Jugador ${userId} empeña a la abuela: $${amount} a favor de ${horse}.`,
        `¡Boom! Jugador ${userId} pone $${amount} sobre la mesa por ${horse}.`,
        `$${amount} apostados. Jugador ${userId} reza para que ${horse} no se rompa la pierna.`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
};

export const getRandomPowerPhrase = (powerId: string, horse: string) => {
    const templates = [
        `¡GOLPE BAJO! Alguien castigó a ${horse} con ${powerId}.`,
        `¡CAOS! Mágicamente ${horse} sufre los efectos de ${powerId}.`,
        `Desde las sombras, ${powerId} impacta brutalmente a ${horse}.`,
        `¡OJO! ${horse} acaba de recibir un regalo envenenado: ${powerId}.`,
        `¡Poder Supremo! ${powerId} activado directamente sobre ${horse}.`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
};
