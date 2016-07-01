USE [TestDB]
GO

/****** Object:  Table [dbo].[GridJobs]    Script Date: 7/1/2016 8:46:56 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

SET ANSI_PADDING ON
GO

CREATE TABLE [dbo].[GridJobs](
	[jobId] [bigint] IDENTITY(1,1) NOT NULL,
	[description] [varchar](250) NULL,
	[cookie] [varchar](250) NULL,
	[userId] [varchar](100) NOT NULL,
	[priority] [int] NOT NULL,
	[submitTime] [datetime] NOT NULL,
	[aborted] [bit] NOT NULL,
 CONSTRAINT [PK_grid_jobs] PRIMARY KEY CLUSTERED 
(
	[jobId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]

GO

SET ANSI_PADDING OFF
GO


USE [TestDB]
GO

/****** Object:  Table [dbo].[GridJobTasks]    Script Date: 7/1/2016 8:47:27 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

SET ANSI_PADDING ON
GO

CREATE TABLE [dbo].[GridJobTasks](
	[jobId] [bigint] NOT NULL,
	[index] [bigint] NOT NULL,
	[cmd] [varchar](max) NOT NULL,
	[cookie] [varchar](250) NULL,
	[stdin] [varchar](max) NULL,
	[status] [varchar](50) NOT NULL,
	[nodeId] [varchar](50) NULL,
	[nodeName] [varchar](250) NULL,
	[pid] [int] NULL,
	[startTime] [datetime] NULL,
	[finishTime] [datetime] NULL,
	[durationSeconds] [bigint] NULL,
	[success] [bit] NULL,
	[retCode] [int] NULL,
	[stdout] [text] NULL,
	[stderr] [text] NULL,
 CONSTRAINT [PK_Table_1] PRIMARY KEY CLUSTERED 
(
	[jobId] ASC,
	[index] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]

GO

SET ANSI_PADDING OFF
GO

USE [TestDB]
GO

/****** Object:  View [dbo].[GridJobsView]    Script Date: 7/1/2016 8:48:10 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE view [dbo].[GridJobsView]
as
with stat as
(
	select
	[jobId]
	,[numTasks]=count(*)
	,[startTime]=min([startTime])
	,[maxFinishTime]=max([finishTime])
	,[numTasksFinished]=cast(sum(iif([status]='FINISHED',1,0)) as bigint)
	,[numSuccess]=cast(sum(iif([success] is null, 0, [success])) as bigint)
	from [dbo].[GridJobTasks] (nolock)
	group by [jobId]
)
,stat2 as
(
	select
	jobs.[description]
	,jobs.[cookie]
	,jobs.[userId]
	,jobs.[priority]
	,jobs.[submitTime]
	,[status]=iif(jobs.[aborted]=1,'ABORTED',iif(stat.[numTasks]=stat.[numTasksFinished],'FINISHED', iif(stat.[startTime] is null, 'SUBMITTED', 'STARTED')))
	,stat.*
	from stat
	left join [dbo].[GridJobs] (nolock) jobs
	on stat.[jobId]=jobs.[jobId]
)
select
stat2.[jobId]
,stat2.[description]
,stat2.[cookie]
,stat2.[userId]
,stat2.[priority]
,stat2.[submitTime]
,stat2.[status]
,stat2.[numTasks]
,stat2.[numTasksFinished]
,stat2.[startTime]
,[finishTime]=iif(stat2.[status]='FINISHED', stat2.[maxFinishTime], null)
,[durationSeconds]=iif(stat2.[status]='FINISHED', DATEDIFF(s, stat2.[startTime], stat2.[maxFinishTime]), null)
,[success]=cast(iif(stat2.[status]='ABORTED', 0, iif(stat2.[numTasks]=stat2.[numSuccess],1,0)) as bit)
,[completePct]=cast(stat2.[numTasksFinished] as float)/cast(stat2.[numTasks] as float) * 100.0
from stat2;


GO

USE [TestDB]
GO

/****** Object:  StoredProcedure [dbo].[stp_NodeJSGridJobTask]    Script Date: 7/1/2016 8:48:34 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE PROCEDURE [dbo].[stp_NodeJSGridJobTask]
	@jobId bigint
	,@taskIndex bigint
	,@nodeId varchar(50) = null
	,@nodeName varchar(250) = null
	,@pid int = null
	,@retCode int = null
	,@stdout text = null
	,@stderr text = null
AS
BEGIN

	SET NOCOUNT ON;

	if not @nodeId is null -- dispatched
	begin
		-- IDLE --> DISPATCHED
		update [dbo].[GridJobTasks]
		set
		[nodeId]=@nodeId
		,[nodeName]=@nodeName
		,[status]='DISPATCHED'
		where
		[jobId]=@jobId
		and [index]=@taskIndex
		and [status]='IDLE'

		select
		[cmd]
		,[stdin]
		from [dbo].[GridJobTasks] (nolock)
		where
		[jobId]=@jobId
		and [index]=@taskIndex
	end
	else
	begin
		if @retCode is null -- mark task start
		begin
			-- DISPATCHED --> RUNNING
			update [dbo].[GridJobTasks]
			set
			[pid]=@pid
			,[startTime]=getdate()
			,[status]='RUNNING'
			where
			[jobId]=@jobId
			and [index]=@taskIndex
			and [status]='DISPATCHED'
		end
		else
		begin -- mark task end
			-- RUNNING --> FINISHED
			declare @finishTime datetime
			set @finishTime=getdate()

			update [dbo].[GridJobTasks]
			set
			[pid]=@pid
			,[status]='FINISHED'
			,[finishTime]=@finishTime
			,[durationSeconds]=iif([startTime] is null, 0, DATEDIFF(s, [startTime], @finishTime))
			,[success]=iif(@retCode=0, 1, 0)
			,[retCode]=@retCode
			,[stdout]=@stdout
			,[stderr]=@stderr
			where
			[jobId]=@jobId
			and [index]=@taskIndex

			update [dbo].[GridJobTasks]
			set
			[startTime]=@finishTime
			where
			[jobId]=@jobId
			and [index]=@taskIndex
			and [startTime] is null

		end -- mark task finished
	end -- mark task finished

END
GO

USE [TestDB]
GO

/****** Object:  StoredProcedure [dbo].[stp_NodeJSGridSubmitJob]    Script Date: 7/1/2016 8:48:53 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE PROCEDURE [dbo].[stp_NodeJSGridSubmitJob]
	@userId varchar(100)
	,@priority int
	,@jobXML xml
AS
BEGIN
	SET NOCOUNT ON;
	
	declare @tmp table
	(
		[id] bigint identity(0,1)
		,[cmd] varchar(max)
		,[cookie] varchar(256)
		,[stdin] varchar(max)
	)

	insert into @tmp
	([cmd],[cookie],[stdin])
	select
	[cmd]=a.b.value('@c', 'varchar(max)')
	,[cookie]=a.b.value('@k', 'varchar(250)')
	,[stdin]=a.b.value('@i', 'varchar(max)') 
	FROM @jobXML.nodes('/job/t') a(b)

	declare @numTasks int
	select @numTasks=max([id])+1 from @tmp

	select
	[err]=0
	,[error]=null
	-- return

	declare @description varchar(250)
	declare @cookie varchar(250)
	declare @jobId bigint

	select
	@description=a.b.value('@description', 'varchar(250)')
	,@cookie=a.b.value('@cookie', 'varchar(250)') 
	FROM @jobXML.nodes('/job') a(b)

	if @description = '' set @description=null
	if @cookie = '' set @cookie=null
	insert into [dbo].[GridJobs]
	([description],[cookie],[userId],[priority],[submitTime],[aborted])
	values (@description, @cookie, @userId, @priority, getdate(), 0)

	set @jobId = @@IDENTITY

	delete from [dbo].[GridJobTasks] where [jobId]=@jobId

	insert into [dbo].[GridJobTasks]
	([jobId],[index],[cmd],[cookie],[stdin],[status])
	select
	[jobId]=@jobId
	,[index]=[id]
	,[cmd]
	,[cookie]=iif([cookie]='', null, [cookie])
	,[stdin]=iif([stdin]='', null, [stdin])
	,[status]='IDLE'
	from @tmp
	order by [id] asc

	select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)

END




GO

USE [TestDB]
GO

/****** Object:  StoredProcedure [dbo].[stp_NodeJSKillJob]    Script Date: 7/1/2016 8:49:13 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE PROCEDURE [dbo].[stp_NodeJSKillJob]
	@jobId bigint
	,@markJobAborted bit = 0
AS
BEGIN
	SET NOCOUNT ON;

	if @markJobAborted=1
	begin
		update [dbo].[GridJobs]
		set
		[aborted]=1
		where [jobId] = @jobId
	end

	select
	[nodeId]
	,[pid]
	from [dbo].[GridJobTasks] (nolock)
	where
	[jobId]=@jobId
	and [status]='RUNNING'
	and [pid] is not null
	and [pid] > 0

	select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)

END

GO

USE [TestDB]
GO

/****** Object:  UserDefinedFunction [dbo].[fnc_NodeJSGridGetJobInfo]    Script Date: 7/1/2016 8:49:31 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE FUNCTION [dbo].[fnc_NodeJSGridGetJobInfo]
(	
	@jobId bigint
)
RETURNS TABLE 
AS
RETURN 
(
	select
	*
	from [dbo].[GridJobsView]
	where [jobId]=@jobId
)

GO

USE [TestDB]
GO

/****** Object:  UserDefinedFunction [dbo].[fnc_NodeJSGridGetJobProgress]    Script Date: 7/1/2016 8:49:49 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE FUNCTION [dbo].[fnc_NodeJSGridGetJobProgress]
(	
	@jobId bigint
)
RETURNS TABLE 
AS
RETURN 
(
	select
	[jobId]
	,[status]
	,[numTasks]
	,[numTasksFinished]
	,[success]
	from [dbo].[GridJobsView]
	where [jobId]=@jobId
)

GO

