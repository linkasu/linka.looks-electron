export interface Card  {
  id: number;
  cardType: 0|1|2
  imagePath: string;
  title: string;
  audioPath: string;
};

export   interface ConfigFile {
    version: string;
    columns: number;
    rows: number;
    withoutSpace: boolean;
    cards: Card[]
}  