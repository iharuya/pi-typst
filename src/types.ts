export type RenderedImage = {
  data: string;
  widthPx: number;
  heightPx: number;
};

export type TypstToolDetails = {
  path?: string | undefined;
  image?: RenderedImage | undefined;
  error?: string | undefined;
};
