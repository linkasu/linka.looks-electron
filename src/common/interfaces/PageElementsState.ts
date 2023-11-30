export interface PageElementsState{
    id: string,
    bottom: number,
    bounds: DOMRect[]
}
export interface BrowserElementsState extends PageElementsState{
    elements: Element[]
}
