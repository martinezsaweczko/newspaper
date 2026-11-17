/** [filename, masthead, tagline, tone] */
export type SampleEdition = [file: string, masthead: string, tagline: string, tone: number];
export declare function makeSamplePdf(edition: SampleEdition, index?: number): Buffer;
