/* ST25 layout adapter: reuse the original editor's controlled fields and handlers. */
window.ST25SkinLayout=function createSkinLayout(React){
  const h=React.createElement;
  const clone=(element,className,children)=>React.cloneElement(element,{className},...(children===undefined?[element.props.children]:children));
  function decorateAction(element){
    if(!React.isValidElement(element))return element;
    const props={};
    if(element.props.className==='w-full'&&element.props.onClick)props.className='w-full st25-apply-button';
    if(element.props.children!==undefined)props.children=React.Children.map(element.props.children,decorateAction);
    return React.cloneElement(element,props);
  }
  return function layout(tree){
    const [preview,controls]=tree.props.children;
    const [settings,colours,actions,presets]=controls.props.children;
    const fields=settings.props.children;
    const settingsFields=fields[1].props.children;
    const select=fields[0].props.children;
    const choices=select.props.children[1].props.children;
    const chosen=select.props.value;
    const species=h('section',{className:'skin-species', 'aria-label':'Chọn loài khủng long'},
      h('div',{className:'skin-section-heading'},h('h2',null,'Chọn loài khủng long'),h('span',null,choices.length+' loài')),
      h('div',{className:'skin-species-grid'},choices.map(choice=>{
        const name=choice.props.value;
        return h('button',{key:name,type:'button',className:'skin-species-card', 'aria-pressed':chosen===name, 'data-species':name,onClick:()=>select.props.onValueChange(name)},
          h('img',{src:'/assets/imges/thumbs/'+(name==='Troodon'?'troodon':name)+'.png'+(name==='Hypsilophodon'?'?v=20261010-hypsi1':''),alt:'',width:120,height:64,decoding:'async'}),
          h('span',null,name));
      })));
    const [colourTitle,colourList]=colours.props.children;
    const palette=clone(colours,'skin-panel skin-colours',[
      h('div',{className:'skin-pattern-fields grid grid-cols-2 gap-3',key:'pattern'},settingsFields[2],settingsFields[3]),
      clone(colourTitle,'skin-colour-title flex items-center justify-between'),
      clone(colourList,'skin-colour-list')
    ]);
    const settingsPanel=clone(settings,'skin-panel skin-settings',[
      h('h2',{key:'heading'},'Thông số skin'),
      h('div',{className:'grid grid-cols-2 gap-3',key:'settings'},settingsFields[0],settingsFields[5]),
      settingsFields[4],
      h('p',{key:'locked',className:'st25-glitch-locked'},'Glitch đã khóa')
    ]);
    return h('div',{className:'skin-designer'},
      h('div',{className:'skin-designer-tabs'},h('span',{className:'skin-designer-tab'},'THIẾT KẾ SKIN'),h('span',{className:'skin-designer-locked','aria-label':'Glitch đã khóa'},'GLITCH · ĐÃ KHÓA')),
      species,
      h('div',{className:'skin-workspace'},
        palette,
        h('div',{className:'skin-preview-column'},
          h('div',{className:'skin-preview-heading'},h('span',null,'XEM TRƯỚC 3D'),h('strong',null,chosen)),
          clone(preview,'skin-panel skin-preview'),
          h('p',{className:'skin-preview-hint'},'Kéo để xoay · Cuộn để thu / phóng')),
        h('aside',{className:'skin-sidebar','aria-label':'Áp dụng và lưu skin'},
          settingsPanel,
          clone(actions,'skin-panel skin-actions',[
            h('div',{key:'fee',className:'st25-apply-fee'},h('span',null,'Phí mỗi lần áp dụng'),h('strong',null,'10 Lúa')),
            ...React.Children.toArray(actions.props.children).map(decorateAction)
          ]),
          clone(presets,'skin-panel skin-presets'))));
  };
};
