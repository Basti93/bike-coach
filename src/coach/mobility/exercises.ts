export type MobilityArea = 'hueftbeuger' | 'oberschenkel-vorn' | 'oberschenkel-hinten' | 'waden' | 'gesaess' | 'brust' | 'ruecken' | 'schultern' | 'nacken';
export type MobilityExercise = { id: string; title: string; howTo: string; area: MobilityArea };

const x = (id: string, area: MobilityArea, title: string, howTo: string): MobilityExercise => ({ id, area, title, howTo });

/** The fixed list. Sessions pick from it by rules; nothing outside it is ever offered. Calm, mostly static, about 30 to 45 seconds per side. */
export const MOBILITY_EXERCISES: MobilityExercise[] = [
  x('mob-hip-flexor-lunge', 'hueftbeuger', 'Hüftbeuger im Ausfallschritt', 'Ein Knie auf einer weichen Unterlage, der andere Fuß weit vorn. Becken leicht nach vorn schieben, bis du vorn an der Hüfte eine angenehme Dehnung spürst. 30 bis 45 Sekunden je Seite, ruhig atmen.'),
  x('mob-hip-flexor-couch', 'hueftbeuger', 'Hüftbeuger mit Aufrichten', 'Knie im Ausfallschritt am Boden, Hände an der vorderen Hüfte. Brustbein heben und den Rücken lang lassen, ohne ins Hohlkreuz zu gehen. 30 Sekunden je Seite.'),
  x('mob-hamstring-seated', 'oberschenkel-hinten', 'Oberschenkelrückseite im Sitzen', 'Auf einer Stuhlkante sitzen, ein Bein gestreckt, Ferse am Boden. Mit langem Rücken aus der Hüfte nach vorn neigen, bis du hinten am Oberschenkel zügig Spannung spürst. 30 bis 45 Sekunden je Seite.'),
  x('mob-hamstring-towel', 'oberschenkel-hinten', 'Oberschenkelrückseite mit Handtuch', 'Auf dem Rücken liegen, ein Handtuch um den Fuß legen und das Bein nach oben führen, soweit es angenehm ist. Das andere Bein bleibt liegen. 30 bis 45 Sekunden je Seite.'),
  x('mob-calf-wall', 'waden', 'Waden an der Wand', 'Hände an die Wand, ein Bein nach hinten, Ferse bleibt am Boden. Das hintere Knie gestreckt lassen und die Hüfte sanft nach vorn schieben. 30 bis 45 Sekunden je Seite.'),
  x('mob-calf-bent', 'waden', 'Waden mit gebeugtem Knie', 'Aus der Wandposition das hintere Knie leicht beugen, die Ferse bleibt unten. Du spürst die Dehnung tiefer an der Wade. 30 Sekunden je Seite.'),
  x('mob-quad-standing', 'oberschenkel-vorn', 'Oberschenkelvorderseite im Stehen', 'Mit einer Hand an der Wand abstützen, den Fuß zum Gesäß führen und das Becken leicht aufrichten. Die Knie bleiben nah beieinander. 30 bis 45 Sekunden je Seite.'),
  x('mob-glute-figure-four', 'gesaess', 'Gesäß in der Vier', 'Auf dem Rücken liegen, einen Knöchel auf das andere Knie legen und das untere Bein zu dir ziehen. Der Kopf bleibt entspannt am Boden. 30 bis 45 Sekunden je Seite.'),
  x('mob-chest-doorway', 'brust', 'Brust im Türrahmen', 'Unterarm am Türrahmen, Ellbogen etwa auf Schulterhöhe. Einen Schritt nach vorn gehen, bis du vorn an der Brust eine angenehme Dehnung spürst. 30 bis 45 Sekunden je Seite.'),
  x('mob-chest-open', 'brust', 'Brust öffnen im Liegen', 'Auf den Rücken legen, die Arme seitlich öffnen, Handflächen nach oben. Die Schultern sinken lassen und ruhig atmen. Etwa eine Minute.'),
  x('mob-cat-cow', 'ruecken', 'Katze und Kuh', 'Im Vierfüßlerstand den Rücken langsam rund und wieder lang machen, im Rhythmus des Atems. Acht bis zehn ruhige Durchgänge.'),
  x('mob-childs-pose', 'ruecken', 'Kindhaltung', 'Aus dem Vierfüßlerstand das Gesäß Richtung Fersen schieben, die Arme nach vorn lang lassen. Die Stirn darf aufliegen. Etwa eine Minute, ruhig atmen.'),
  x('mob-shoulder-cross', 'schultern', 'Schulter über Kreuz', 'Einen Arm quer vor der Brust halten und mit dem anderen sanft heranziehen. Die Schulter bleibt unten. 30 Sekunden je Seite.'),
  x('mob-neck-side', 'nacken', 'Nacken zur Seite', 'Aufrecht sitzen, das Ohr langsam zur Schulter neigen, die andere Schulter locker sinken lassen. Ohne Druck mit der Hand, 20 bis 30 Sekunden je Seite.'),
];
