export type Card = StandardCard

interface StandardCard {
  id: string;
  cardType: 0|1|2|3;
  imagePath?: string;
  title?: string;
  audioPath?: string;
  answer?: true
}
export interface NewCard {
  id: string,
  cardType: 3
}

export interface ConfigFile {
    version: string;
    columns: number;
    rows: number;
    withoutSpace: boolean;
    directSet?: boolean
    quiz?: boolean
    questions?: string[],
    quizAutoNext?: boolean,
    quizReadQuestion?: boolean,
    cards: Card[];
    description?: string
}
