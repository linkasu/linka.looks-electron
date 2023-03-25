export   interface ConfigFile {
    version: string;
    columns: number;
    rows: number;
    withoutSpace: boolean;
    cards: {
      id: number;
      imagePath: string;
      title: string;
      audioPath: string
    }[]
}  