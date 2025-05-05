@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(
    private alertController: AlertController,
    private actionSheetController: ActionSheetController
  ) {}
  
  async confirmAction(header: string, message: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header,
        message,
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => resolve(false)
          },
          {
            text: 'Confirm',
            handler: () => resolve(true)
          }
        ]
      });
      
      await alert.present();
    });
  }
  
  async presentActionSheet(header: string, actions: {
    text: string;
    icon?: string;
    role?: string;
    handler: () => void;
  }[]): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      header,
      buttons: actions
    });
    
    await actionSheet.present();
  }
}