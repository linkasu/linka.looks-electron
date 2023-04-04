export type Card = StandardCard 


interface StandardCard {
  id: string;
  cardType: 0|1|2
  imagePath?: string;
  title?: string;
  audioPath?: string;
};
export interface NewCard {
  id: string,
  cardType: 3
}

export   interface ConfigFile {
    version: string;
    columns: number;
    rows: number;
    withoutSpace: boolean;
    directSet?: boolean
    cards: Card[]
}  