export enum CardType {
  AudioCard = 0,
  SpaceCard = 1,
  EmptyCard = 2,
  NewCard = 3
}
export interface Card {
  id: string;
  cardType: CardType;
  imagePath?: string;
  title?: string;
  audioPath?: string;
  audioText?: string;
  answer?: true
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
