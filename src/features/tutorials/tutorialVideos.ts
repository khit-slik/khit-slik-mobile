// How-to videos for the native screens, opened from the navbar's "ကြည့်နည်း" button.
// The web app lists the same videos in Autoshop-Frontend/config/tutorialVideos.ts; keep the two in step.
// `videoId` is the 11 characters after youtu.be/ in the share link (Unlisted videos are fine).

export interface TutorialVideo {
  videoId: string;
  title: string;
}

const ORDER_CREATE: TutorialVideo = { videoId: 'dttR1eZI6xQ', title: 'အော်ဒါ ဖန်တီးနည်း (ဘောင်ချာထုတ်နည်း)' };
const ORDER_EDIT: TutorialVideo = { videoId: 'syI31fv16hk', title: 'အော်ဒါ ပြင်နည်း' };

export const POS_TUTORIALS: TutorialVideo[] = [ORDER_CREATE];
export const ORDER_EDIT_TUTORIALS: TutorialVideo[] = [ORDER_EDIT, ORDER_CREATE];
